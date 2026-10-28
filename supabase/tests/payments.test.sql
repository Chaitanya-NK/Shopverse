-- =============================================================================
-- Online payments: settings, awaiting payment, captures, refunds, expiry.
-- Runs in a transaction and rolls back.
-- =============================================================================
begin;

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  execute case when p_user is null then 'set local role anon' else 'set local role authenticated' end;
end $$;

create function pg_temp.as_server() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  set local role service_role;
end $$;

create function pg_temp.assert(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'ASSERTION FAILED: %', p_msg; end if;
end $$;

create function pg_temp.expect_error(p_sql text, p_state text, p_msg text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ASSERTION FAILED (no error): %', p_msg;
exception when others then
  if sqlstate = 'P0001' and sqlerrm like 'ASSERTION FAILED%' then raise; end if;
  if sqlstate <> p_state then
    raise exception 'ASSERTION FAILED: % (expected %, got % %)', p_msg, p_state, sqlstate, sqlerrm;
  end if;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@retail.test', '{"full_name":"Owner"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'other@else.test', '{"full_name":"Other"}');

-- ---------------------------------------------------------------------------
-- Setup
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
create temp table o on commit drop as
  select (public.create_organization('Mega Retail', 'mega-retail', 'Mega Store', 'mega-store', 'INR',
          'Bengaluru WH', 'BLR', 'Bengaluru', array['electronics', 'fashion']) ->> 'organization_id')::uuid as org;
create temp table ids on commit drop as select
  (select org from o) as org,
  (select id from public.warehouses where organization_id = (select org from o)) as wh,
  (select id from public.shops where organization_id = (select org from o)) as shop;

select public.create_product((select org from ids),
  jsonb_build_object('title', 'Classic Tee', 'slug', 'classic-tee', 'status', 'active', 'tags', '["cotton"]'::jsonb,
    'category_id', (select id from public.categories where slug = 'clothing' and organization_id = (select org from ids))),
  '[{"sku":"TEE-M","title":"M","price":499,"compare_at_price":699,"options":{"size":"M"}},
    {"sku":"TEE-L","title":"L","price":549,"options":{"size":"L"}}]', array[(select shop from ids)]);
select public.create_product((select org from ids),
  jsonb_build_object('title', 'Acme X1', 'slug', 'acme-x1', 'status', 'active',
    'category_id', (select id from public.categories where slug = 'mobile-phones' and organization_id = (select org from ids)),
    'attributes', '{"brand":"Acme","model":"X1"}'::jsonb),
  '[{"sku":"X1","price":19999}]', array[(select shop from ids)]);
-- A draft product and an unpublished one never show.
select public.create_product((select org from ids),
  jsonb_build_object('title', 'Secret Tee', 'slug', 'secret-tee', 'status', 'draft',
    'category_id', (select id from public.categories where slug = 'clothing' and organization_id = (select org from ids))),
  '[{"sku":"TEE-S","title":"S","price":1,"options":{"size":"S"}}]', array[(select shop from ids)]);
select public.create_product((select org from ids),
  jsonb_build_object('title', 'Hidden Tee', 'slug', 'hidden-tee', 'status', 'active',
    'category_id', (select id from public.categories where slug = 'clothing' and organization_id = (select org from ids))),
  '[{"sku":"TEE-H","title":"XL","price":1,"options":{"size":"XL"}}]');

select public.receive_stock((select id from public.product_variants where sku = 'TEE-M'), (select wh from ids), 30);
select public.receive_stock((select id from public.product_variants where sku = 'X1'), (select wh from ids), null,
  array['IMEI-1', 'IMEI-2']);

create temp table v on commit drop as select
  (select id from public.product_variants where sku = 'TEE-M') as tee_m,
  (select id from public.product_variants where sku = 'TEE-L') as tee_l,
  (select id from public.product_variants where sku = 'X1') as phone;
grant select on o, ids, v to anon, service_role;

-- ---------------------------------------------------------------------------
-- Visibility: draft shops are private, staff can preview
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null);
select pg_temp.assert(public.storefront_shop('mega-store') is null, 'a draft shop is invisible to the public');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert((public.storefront_shop('mega-store') ->> 'live')::boolean = false, 'staff can preview a draft shop');
update public.shops set status = 'live', settings = '{"shipping_fee":49,"free_shipping_over":1000,"cod_limit":15000}'
where id = (select shop from ids);
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'staff@retail.test');
insert into public.organization_members (organization_id, user_id, role) select org, '00000000-0000-0000-0000-0000000000c1', 'staff' from ids;
create temp table addr on commit drop as select
  '{"name":"Asha Rao","phone":"+919800000001","line1":"12 MG Road","city":"Pune","state":"Maharashtra","postal_code":"411001"}'::jsonb as a;
grant select on addr to service_role, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null);
select pg_temp.assert(
  (public.storefront_shop('mega-store') -> 'payment_methods') = '["cod"]'::jsonb, 'COD only until a payment account is connected');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect_error(format($q$select public.save_payment_account(%L, 'rzp_test_abcdef123', 'enc', null, true)$q$,
  (select org from ids)), '42501', 'staff cannot connect payments');
select pg_temp.expect_error(format($q$select public.get_payment_settings(%L)$q$, (select org from ids)), '42501',
  'staff cannot see payment settings');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error(format($q$select public.save_payment_account(%L, 'sk_live_nope', 'enc', null, true)$q$,
  (select org from ids)), '23514', 'key ids are checked');
select public.save_payment_account((select org from ids), 'rzp_test_abcdef123', 'v1:secret', 'v1:hook', true);
select pg_temp.assert(
  (select j ->> 'mode' = 'test' and (j ->> 'webhook_configured')::boolean and not j ? 'key_secret_enc'
   from (select public.get_payment_settings((select org from ids)) j) x),
  'owners see the account but never the secrets');
select public.save_payment_account((select org from ids), 'rzp_test_abcdef123', null, null, true);
select pg_temp.expect_error(format($q$select public.payment_account_credentials(%L)$q$, (select org from ids)), '42501',
  'only the server reads credentials');
select pg_temp.assert(exists (select 1 from public.audit_logs where action = 'payments.updated'), 'audited');

select pg_temp.as_server();
select pg_temp.assert(
  (select j ->> 'key_secret_enc' = 'v1:secret' from (select public.payment_account_credentials((select org from ids)) j) x),
  'saving without a new secret keeps the old one');

select pg_temp.act_as(null);
select pg_temp.assert(
  (public.storefront_shop('mega-store') -> 'payment_methods') = '["online", "cod"]'::jsonb, 'online offered once connected');

-- ---------------------------------------------------------------------------
-- Guest online checkout: above the COD limit, held for payment
-- ---------------------------------------------------------------------------
select pg_temp.as_server();
select pg_temp.expect_error(format($q$select public.storefront_checkout_start(%L,
  jsonb_build_array(jsonb_build_object('variant_id', %L, 'quantity', 1)), '{"email":"c@example.com"}', %L, 'cod')$q$,
  (select shop from ids), (select phone from v), (select a from addr)), '23514', 'COD limit still applies to COD');
create temp table c1 on commit drop as select public.storefront_checkout_start((select shop from ids),
  jsonb_build_array(jsonb_build_object('variant_id', (select phone from v), 'quantity', 1)),
  '{"name":"Asha","email":"asha@example.com","phone":"+919800000001"}', (select a from addr), 'online') as j;
create temp table r1 on commit drop as
  select public.storefront_checkout_confirm((select (j ->> 'checkout_id')::uuid from c1), (select j ->> 'otp' from c1)) as j;
grant select on c1, r1 to service_role, authenticated, anon;
select pg_temp.assert((select (j ->> 'awaiting_payment')::boolean and (j ->> 'grand_total')::numeric = 19999 from r1),
  'online orders above the COD limit are allowed and await payment');

reset role;
create temp table o1 on commit drop as select * from public.orders where id = (select (j ->> 'order_id')::uuid from r1);
grant select on o1 to service_role, authenticated, anon;
select pg_temp.assert((select status = 'pending' and payment_method = 'online' and payment_due_at > now() + interval '29 minutes' from o1),
  'pending with 30 minutes to pay');
select pg_temp.assert((select reserved = 1 from public.inventory_levels where variant_id = (select phone from v)), 'stock is held');
select pg_temp.act_as(null);
select pg_temp.assert((public.storefront_order((select public_token from o1)) ->> 'stage') = 'awaiting_payment', 'stage: awaiting payment');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error(format($q$select public.confirm_order(%L)$q$, (select id from o1)), '23514',
  'staff cannot confirm an order that is waiting for payment');

-- ---------------------------------------------------------------------------
-- Captures
-- ---------------------------------------------------------------------------
select pg_temp.as_server();
select pg_temp.assert((select (public.begin_online_payment((select public_token from o1)) ->> 'amount')::numeric = 19999),
  'payment starts with the order total');
select public.record_payment_attempt((select id from o1), 'order_A', 19999, 'INR');
select public.record_payment_attempt((select id from o1), 'order_B', 19999, 'INR');
select public.record_payment_attempt((select id from o1), 'order_C', 19999, 'INR');

select pg_temp.assert((public.record_payment_captured('order_A', 'pay_A', 100, 'upi') ->> 'result') = 'amount_mismatch',
  'a wrong amount is not accepted');
select pg_temp.assert((public.record_payment_captured('nope', 'pay_X', 1, 'upi') ->> 'result') = 'unknown', 'unknown orders');
select public.record_payment_failed('order_B', 'pay_B0', 'Bank declined');
select pg_temp.assert((public.record_payment_captured('order_B', 'pay_B', 19999, 'upi') ->> 'result') = 'confirmed',
  'a retry after a failure confirms the order');
select pg_temp.assert((public.record_payment_captured('order_B', 'pay_B', 19999, 'upi') ->> 'result') = 'already_recorded',
  'callback and webhook can both arrive');
select pg_temp.assert((public.record_payment_captured('order_C', 'pay_C', 19999, 'card') ->> 'result') = 'duplicate',
  'a second payment for a paid order is flagged');

reset role;
select pg_temp.assert(
  (select status = 'confirmed' and payment_status = 'paid' and payment_method = 'upi' and payment_due_at is null
   from public.orders where id = (select id from o1)), 'paid online by UPI and confirmed');
select pg_temp.assert(
  (select count(*) = 2 from public.order_events where order_id = (select id from o1) and type = 'payment.refund_due'),
  'refunds owed are on the timeline');

select pg_temp.as_server();
create temp table due on commit drop as select jsonb_array_elements(public.payments_to_refund((select id from o1))) as j;
grant select on due to service_role;
select pg_temp.assert((select count(*) = 2 and sum((j ->> 'amount')::numeric) = 19999 + 100 from due),
  'the mismatched and the duplicate payment are due back; the good one is kept');
select public.record_refund((j ->> 'payment_id')::uuid, 'rfnd_' || (j ->> 'provider_payment_id'), (j ->> 'amount')::numeric) from due;
select pg_temp.assert(jsonb_array_length(public.payments_to_refund((select id from o1))) = 0, 'nothing left to refund');
reset role;
select pg_temp.assert((select payment_status = 'paid' from public.orders where id = (select id from o1)),
  'refunding extra payments leaves the order paid');

-- Staff read payments; other tenants and the public don't.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert((select count(*) = 3 from public.payments where order_id = (select id from o1)), 'staff see the attempts');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert((select count(*) = 0 from public.payments), 'other tenants see none');
select pg_temp.expect_error($q$insert into public.payments (organization_id, order_id, provider_order_id, amount, currency)
  values (gen_random_uuid(), gen_random_uuid(), 'x', 1, 'INR')$q$, '42501', 'nobody writes payments directly');

-- Cancelling a paid order puts the money up for refund.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select public.cancel_order((select id from o1), 'Customer changed mind');
select pg_temp.as_server();
create temp table due2 on commit drop as select jsonb_array_elements(public.payments_to_refund((select id from o1))) as j;
grant select on due2 to service_role;
select pg_temp.assert((select count(*) = 1 and min(j ->> 'provider_payment_id') = 'pay_B' from due2), 'the paid amount is due back');
select public.record_refund((j ->> 'payment_id')::uuid, 'rfnd_B', (j ->> 'amount')::numeric) from due2;
reset role;
select pg_temp.assert((select payment_status = 'refunded' from public.orders where id = (select id from o1)), 'order refunded');

-- ---------------------------------------------------------------------------
-- Expiry
-- ---------------------------------------------------------------------------
select pg_temp.as_server();
create temp table c2 on commit drop as select public.storefront_checkout_start((select shop from ids),
  jsonb_build_array(jsonb_build_object('variant_id', (select tee_m from v), 'quantity', 2)),
  '{"name":"Ravi","email":"ravi@example.com","phone":"+919800000002"}', (select a from addr), 'online') as j;
create temp table r2 on commit drop as
  select public.storefront_checkout_confirm((select (j ->> 'checkout_id')::uuid from c2), (select j ->> 'otp' from c2)) as j;
grant select on c2, r2 to service_role;
reset role;
select pg_temp.assert((select reserved = 2 from public.inventory_levels where variant_id = (select tee_m from v)), 'tees held');
update public.orders set payment_due_at = now() - interval '1 minute' where id = (select (j ->> 'order_id')::uuid from r2);
select pg_temp.as_server();
select pg_temp.assert(
  (public.begin_online_payment((select public_token from public.orders where id = (select (j ->> 'order_id')::uuid from r2))) ->> 'expired')::boolean,
  'paying after the deadline is refused');
reset role;
select pg_temp.assert(
  (select status = 'cancelled' and cancel_reason like 'Online payment%' from public.orders where id = (select (j ->> 'order_id')::uuid from r2)),
  'and the order is cancelled');
select pg_temp.assert((select reserved = 0 from public.inventory_levels where variant_id = (select tee_m from v)), 'stock released');
select pg_temp.as_server();
select pg_temp.assert(public.expire_unpaid_orders() = 0, 'nothing else to expire');

-- Webhook idempotency.
select pg_temp.assert(public.register_webhook_event('evt_1', (select org from ids), 'payment.captured'), 'first delivery');
select pg_temp.assert(not public.register_webhook_event('evt_1', (select org from ids), 'payment.captured'), 'repeat ignored');

-- Shops can stop accepting a method.
reset role;
update public.shops set settings = settings || '{"accept_cod": false}' where id = (select shop from ids);
select pg_temp.act_as(null);
select pg_temp.assert((public.storefront_shop('mega-store') -> 'payment_methods') = '["online"]'::jsonb, 'online only');
select pg_temp.as_server();
select pg_temp.expect_error(format($q$select public.storefront_checkout_start(%L,
  jsonb_build_array(jsonb_build_object('variant_id', %L, 'quantity', 1)), '{"email":"c@example.com"}', %L, 'cod')$q$,
  (select shop from ids), (select tee_m from v), (select a from addr)), '23514', 'COD refused when switched off');

select 'ALL PAYMENT TESTS PASSED' as result;
rollback;
