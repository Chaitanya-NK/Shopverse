-- =============================================================================
-- Shopper accounts: sign-in, sessions, addresses, wishlist, orders, cancel, signed-in checkout.
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

-- A second business with its own shop (sessions must not cross over).
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
create temp table o2 on commit drop as
  select (public.create_organization('Other Co', 'other-co', 'Other Store', 'other-store', 'INR',
          'WH', 'WH', 'Pune', array['fashion']) ->> 'organization_id')::uuid as org;
update public.shops set status = 'live' where organization_id = (select org from o2);
create temp table ids2 on commit drop as select (select id from public.shops where organization_id = (select org from o2)) as shop;
grant select on o2, ids2 to anon, service_role;

create temp table addr on commit drop as select
  '{"name":"Asha Rao","phone":"+919800000001","line1":"12 MG Road","city":"Pune","state":"Maharashtra","postal_code":"411001"}'::jsonb as a;
grant select on addr to service_role, anon, authenticated;

-- A guest order placed before Asha had an account.
select pg_temp.as_server();
create temp table g on commit drop as select public.storefront_checkout_start((select shop from ids),
  jsonb_build_array(jsonb_build_object('variant_id', (select tee_m from v), 'quantity', 1)),
  '{"name":"Asha Rao","email":"asha@example.com","phone":"+919800000001"}', (select a from addr)) as j;
create temp table gr on commit drop as
  select public.storefront_checkout_confirm((select (j ->> 'checkout_id')::uuid from g), (select j ->> 'otp' from g)) as j;
grant select on g, gr to service_role;

-- ---------------------------------------------------------------------------
-- Only the server may call shopper functions
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null);
select pg_temp.expect_error(format($q$select public.shopper_sign_in_start(%L, 'a@b.co')$q$, (select shop from ids)),
  '42501', 'the public cannot start a sign-in (it returns the code)');
select pg_temp.expect_error($q$select public.shopper_me('00000000-0000-0000-0000-000000000000', repeat('a', 64))$q$,
  '42501', 'the public cannot read sessions directly');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error($q$insert into public.customer_addresses (organization_id, customer_id, name, phone, line1, city, state, postal_code)
  select organization_id, id, 'X Y', '+919800000009', 'Somewhere 1', 'Pune', 'MH', '411001' from public.customers limit 1$q$,
  '42501', 'staff cannot write shopper addresses directly');

-- ---------------------------------------------------------------------------
-- Sign in
-- ---------------------------------------------------------------------------
select pg_temp.as_server();
select pg_temp.expect_error(format($q$select public.shopper_sign_in_start(%L, 'nope')$q$, (select shop from ids)),
  '23514', 'email is validated');

create temp table si on commit drop as select public.shopper_sign_in_start((select shop from ids), ' Asha@Example.com ') as j;
select pg_temp.assert((select j ->> 'otp' ~ '^[0-9]{6}$' and j ->> 'email' = 'asha@example.com' from si), 'a code is issued');
select pg_temp.expect_error(format($q$select public.shopper_sign_in_resend(%L)$q$, (select j ->> 'sign_in_id' from si)),
  '23514', 'resend is throttled');
select pg_temp.assert(
  (select (r ->> 'ok')::boolean = false and (r ->> 'attempts_left')::int = 4
   from (select public.shopper_sign_in_verify((select (j ->> 'sign_in_id')::uuid from si),
           case when (select j ->> 'otp' from si) = '000000' then '111111' else '000000' end) as r) x),
  'a wrong code is counted');
create temp table sess on commit drop as
  select public.shopper_sign_in_verify((select (j ->> 'sign_in_id')::uuid from si), (select j ->> 'otp' from si), 'test-agent') as j;
create temp table t on commit drop as select (select j ->> 'token' from sess) as tok;
grant select on si, sess, t to service_role;
select pg_temp.assert((select (j ->> 'ok')::boolean and j ->> 'token' ~ '^[0-9a-f]{64}$' and (j ->> 'needs_name')::boolean = false from sess),
  'the right code opens a session; the guest checkout already gave a name');
select pg_temp.assert(
  (select (public.shopper_sign_in_verify((select (j ->> 'sign_in_id')::uuid from si), (select j ->> 'otp' from si)) ->> 'ok')::boolean = false),
  'a code works only once');

reset role;
select pg_temp.assert(
  (select count(*) = 1 and bool_and(token_hash <> (select tok from t) and token_hash = encode(extensions.digest((select tok from t), 'sha256'), 'hex'))
   from private.shopper_sessions),
  'only a hash of the session token is stored');
select pg_temp.assert(
  (select count(*) = 1 from public.customers where email = 'asha@example.com' and last_sign_in_at is not null),
  'signing in reuses the guest customer record');

select pg_temp.as_server();
create temp table me on commit drop as select public.shopper_me((select shop from ids), (select tok from t)) as j;
select pg_temp.assert((select j ->> 'email' = 'asha@example.com' and j ->> 'name' = 'Asha Rao' from me), 'who am I');
select pg_temp.assert(public.shopper_me((select shop from ids2), (select tok from t)) is null,
  'a session is only valid in its own business''s shops');
select pg_temp.assert(public.shopper_me((select shop from ids), repeat('a', 64)) is null, 'unknown tokens are nobody');
select pg_temp.assert(public.shopper_me((select shop from ids), 'not-a-token') is null, 'malformed tokens are nobody');
select pg_temp.expect_error(format($q$select public.shopper_orders(%L, %L)$q$, (select shop from ids2), (select tok from t)),
  '42501', 'another business''s shop refuses the session');

-- New shoppers get a customer record on first sign-in.
create temp table si2 on commit drop as select public.shopper_sign_in_start((select shop from ids), 'new@example.com') as j;
grant select on si2 to service_role;
select pg_temp.assert(
  (select (public.shopper_sign_in_verify((select (j ->> 'sign_in_id')::uuid from si2), (select j ->> 'otp' from si2)) ->> 'needs_name')::boolean),
  'a brand-new shopper is asked for their name');

-- Rate limit per email.
select public.shopper_sign_in_start((select shop from ids), 'flood@example.com') from generate_series(1, 5);
select pg_temp.expect_error(format($q$select public.shopper_sign_in_start(%L, 'FLOOD@example.com')$q$, (select shop from ids)),
  '23514', 'sign-ins are rate limited per email');

-- Five wrong codes lock it.
create temp table si3 on commit drop as select public.shopper_sign_in_start((select shop from ids), 'lock@example.com') as j;
grant select on si3 to service_role;
select public.shopper_sign_in_verify((select (j ->> 'sign_in_id')::uuid from si3), 'abcdef') from generate_series(1, 5);
select pg_temp.assert(
  (select (public.shopper_sign_in_verify((select (j ->> 'sign_in_id')::uuid from si3), (select j ->> 'otp' from si3)) ->> 'locked')::boolean),
  'locked after five wrong codes');

-- ---------------------------------------------------------------------------
-- Profile and addresses
-- ---------------------------------------------------------------------------
select public.shopper_update_profile((select shop from ids), (select tok from t),
  '{"name":"Asha R","phone":"+91 98000 00001","accepts_marketing":true}');
select pg_temp.assert(
  (select j ->> 'name' = 'Asha R' and j ->> 'phone' = '+919800000001' and (j ->> 'accepts_marketing')::boolean
   from (select public.shopper_me((select shop from ids), (select tok from t)) j) x), 'profile updated');
select pg_temp.expect_error(format($q$select public.shopper_update_profile(%L, %L, '{"name":"A"}')$q$,
  (select shop from ids), (select tok from t)), '23514', 'name is required');

create temp table a1 on commit drop as select public.shopper_save_address((select shop from ids), (select tok from t),
  (select a from addr) || '{"label":"Home"}') as id;
create temp table a2 on commit drop as select public.shopper_save_address((select shop from ids), (select tok from t),
  (select a from addr) || '{"label":"Office","line1":"5 Tech Park","is_default":true}') as id;
grant select on a1, a2 to service_role;
select pg_temp.assert(
  (select (j -> 'addresses' -> 0 ->> 'id')::uuid = (select id from a2) and jsonb_array_length(j -> 'addresses') = 2
   from (select public.shopper_me((select shop from ids), (select tok from t)) j) x),
  'the newest default comes first; only one default');
select public.shopper_delete_address((select shop from ids), (select tok from t), (select id from a2));
select pg_temp.assert(
  (select (j -> 'addresses' -> 0 ->> 'is_default')::boolean and (j -> 'addresses' -> 0 ->> 'id')::uuid = (select id from a1)
   from (select public.shopper_me((select shop from ids), (select tok from t)) j) x),
  'deleting the default promotes another');

-- Someone else's session can't touch Asha's address.
create temp table other on commit drop as select public.shopper_sign_in_start((select shop from ids), 'bob@example.com') as j;
create temp table ot on commit drop as select
  public.shopper_sign_in_verify((select (j ->> 'sign_in_id')::uuid from other), (select j ->> 'otp' from other)) ->> 'token' as tok;
grant select on other, ot to service_role;
select pg_temp.expect_error(format($q$select public.shopper_set_default_address(%L, %L, %L)$q$,
  (select shop from ids), (select tok from ot), (select id from a1)), 'P0002', 'addresses are private to their owner');
select public.shopper_delete_address((select shop from ids), (select tok from ot), (select id from a1));
reset role;
select pg_temp.assert(exists (select 1 from public.customer_addresses where id = (select id from a1)),
  'deleting someone else''s address does nothing');

-- ---------------------------------------------------------------------------
-- Orders, cancel, reorder
-- ---------------------------------------------------------------------------
select pg_temp.as_server();
create temp table ol on commit drop as select public.shopper_orders((select shop from ids), (select tok from t)) as j;
select pg_temp.assert(
  (select (j ->> 'total')::int = 1 and j -> 'items' -> 0 ->> 'public_token' = (select j ->> 'public_token' from gr)
     and (j -> 'items' -> 0 ->> 'can_cancel')::boolean from ol),
  'the guest order shows in the account and can be cancelled');
select pg_temp.assert(
  public.shopper_order_access((select shop from ids), (select tok from ot), (select j ->> 'public_token' from gr)) is null,
  'other shoppers have no access to it');
select pg_temp.assert(
  (select jsonb_array_length(public.shopper_order_access((select shop from ids), (select tok from t),
     (select j ->> 'public_token' from gr)) -> 'lines') = 1),
  'reorder lines are available to the owner');
select pg_temp.expect_error(format($q$select public.shopper_cancel_order(%L, %L, %L)$q$,
  (select shop from ids), (select tok from ot), (select j ->> 'public_token' from gr)), 'P0002', 'others cannot cancel it');

select public.shopper_cancel_order((select shop from ids), (select tok from t), (select j ->> 'public_token' from gr), 'Ordered by mistake');
reset role;
select pg_temp.assert(
  (select status = 'cancelled' and cancel_reason = 'Ordered by mistake' from public.orders where public_token = (select j ->> 'public_token' from gr)),
  'the customer cancelled the order');
select pg_temp.assert((select reserved = 0 from public.inventory_levels where variant_id = (select tee_m from v)),
  'cancelling releases the reserved stock');
select pg_temp.assert(
  exists (select 1 from public.order_events where type = 'order.cancelled' and message like 'Cancelled by the customer%'),
  'the timeline says the customer cancelled');

-- ---------------------------------------------------------------------------
-- Signed-in checkout
-- ---------------------------------------------------------------------------
select pg_temp.as_server();
create temp table ck on commit drop as select public.shopper_checkout((select shop from ids), (select tok from t),
  '11111111-2222-3333-4444-555555555555',
  jsonb_build_array(jsonb_build_object('variant_id', (select tee_m from v), 'quantity', 2, 'unit_price', 1)),
  '{"name":"Asha R","phone":"+919800000001"}', (select a from addr) || '{"line1":"77 New Lane"}', 'cod', true) as j;
grant select on ck to service_role, authenticated;
select pg_temp.assert(
  (select (j ->> 'grand_total')::numeric = 1047 from ck), 'signed-in checkout re-prices and charges shipping');
select pg_temp.assert(
  (select (public.shopper_checkout((select shop from ids), (select tok from t), '11111111-2222-3333-4444-555555555555',
     jsonb_build_array(jsonb_build_object('variant_id', (select tee_m from v), 'quantity', 2)),
     '{"name":"Asha R","phone":"+919800000001"}', (select a from addr)) ->> 'order_id') = (select j ->> 'order_id' from ck)),
  'retrying the same request returns the same order');
reset role;
select pg_temp.assert(
  (select o.status = 'confirmed' and o.source = 'storefront' and c.email::text = 'asha@example.com'
   from public.orders o join public.customers c on c.id = o.customer_id where o.id = (select (j ->> 'order_id')::uuid from ck)),
  'the order is confirmed and belongs to the signed-in customer');
select pg_temp.assert((select count(*) = 2 from public.customer_addresses a join public.customers c on c.id = a.customer_id
  where c.email = 'asha@example.com'), 'the new address was saved');
select pg_temp.assert((select reserved = 2 from public.inventory_levels where variant_id = (select tee_m from v)), 'stock reserved');

-- Once packed, shoppers can no longer cancel.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select public.create_shipment((select (j ->> 'order_id')::uuid from ck), (select wh from ids),
  jsonb_build_array(jsonb_build_object('order_item_id',
    (select id from public.order_items where order_id = (select (j ->> 'order_id')::uuid from ck)), 'quantity', 2)));
select pg_temp.as_server();
select pg_temp.expect_error(format($q$select public.shopper_cancel_order(%L, %L, %L)$q$,
  (select shop from ids), (select tok from t), (select j ->> 'public_token' from ck)), '23514',
  'packed orders cannot be cancelled by the shopper');

-- ---------------------------------------------------------------------------
-- Wishlist
-- ---------------------------------------------------------------------------
select public.shopper_set_wishlist((select shop from ids), (select tok from t),
  (select id from public.products where slug = 'acme-x1' and organization_id = (select org from ids)), true);
select public.shopper_set_wishlist((select shop from ids), (select tok from t),
  (select id from public.products where slug = 'acme-x1' and organization_id = (select org from ids)), true);
select pg_temp.assert(
  (select jsonb_array_length(w) = 1 and w -> 0 ->> 'slug' = 'acme-x1'
   from (select public.shopper_wishlist((select shop from ids), (select tok from t)) w) x),
  'saving twice keeps one entry; the wishlist lists product cards');
select pg_temp.expect_error(format($q$select public.shopper_set_wishlist(%L, %L, %L, true)$q$,
  (select shop from ids), (select tok from t),
  (select id from public.products where slug = 'secret-tee' and organization_id = (select org from ids))),
  'P0002', 'drafts cannot be saved');
select public.shopper_set_wishlist((select shop from ids), (select tok from t),
  (select id from public.products where slug = 'acme-x1' and organization_id = (select org from ids)), false);
select pg_temp.assert(jsonb_array_length(public.shopper_wishlist((select shop from ids), (select tok from t))) = 0, 'removed');

-- ---------------------------------------------------------------------------
-- Sign out
-- ---------------------------------------------------------------------------
select public.shopper_sign_out((select tok from t));
select pg_temp.assert(public.shopper_me((select shop from ids), (select tok from t)) is null, 'signed out sessions are dead');

-- Staff cancellation still works and keeps its message.
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error(format($q$select public.cancel_order(%L)$q$, (select (j ->> 'order_id')::uuid from ck)),
  '23514', 'staff must cancel shipments first');

select 'ALL SHOPPER ACCOUNT TESTS PASSED' as result;
rollback;
