-- =============================================================================
-- Discounts: rules, quotes, checkout, limits under concurrency, GST on discounted lines.
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
update public.shops set status = 'live',
  settings = '{"shipping_fee":49,"free_shipping_over":1000,"cod_limit":15000}'
where id = (select shop from ids);
update public.categories set gst_rate = 5 where slug = 'clothing' and organization_id = (select org from ids);

-- Another business with its own shop.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
create temp table o2 on commit drop as
  select (public.create_organization('Other Co', 'other-co', 'Other Store', 'other-store', 'INR',
          'WH', 'WH', 'Pune', array['fashion']) ->> 'organization_id')::uuid as org;
grant select on o2 to authenticated, service_role, anon;

-- ---------------------------------------------------------------------------
-- Staff create discounts (RLS)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
insert into public.discounts (organization_id, code, title, kind, value, max_discount) values
  ((select org from ids), 'WELCOME10', '10% off', 'percent', 10, 100);
insert into public.discounts (organization_id, code, title, kind, value, min_subtotal) values
  ((select org from ids), 'flat50', '₹50 off over ₹500', 'fixed', 50, 500);
insert into public.discounts (organization_id, code, title, kind) values
  ((select org from ids), 'FREESHIP', 'Free delivery', 'free_shipping');
insert into public.discounts (organization_id, code, title, kind, value, usage_limit) values
  ((select org from ids), 'ONLYONE', 'One lucky shopper', 'percent', 20, 1);
insert into public.discounts (organization_id, code, title, kind, value, per_customer_limit) values
  ((select org from ids), 'PERONE', 'Once each', 'fixed', 20, 1);
insert into public.discounts (organization_id, code, title, kind, value, first_order_only) values
  ((select org from ids), 'FIRST', 'First order', 'fixed', 30, true);
insert into public.discounts (organization_id, code, title, kind, value, starts_at) values
  ((select org from ids), 'SOON', 'Later', 'fixed', 10, now() + interval '1 day');
insert into public.discounts (organization_id, code, title, kind, value, starts_at, ends_at) values
  ((select org from ids), 'OLD', 'Gone', 'fixed', 10, now() - interval '2 days', now() - interval '1 day');
insert into public.discounts (organization_id, title, kind, value) values
  ((select org from ids), 'Festive 5% off', 'percent', 5);
insert into public.discounts (organization_id, code, title, kind, value, is_active) values
  ((select org from ids), 'UNUSED', 'Never used', 'fixed', 5, false);

select pg_temp.expect_error(format($q$insert into public.discounts (organization_id, code, title, kind, value)
  values (%L, 'welcome10', 'dupe', 'fixed', 1)$q$, (select org from ids)), '23505', 'codes are unique per business, any case');
select pg_temp.expect_error(format($q$insert into public.discounts (organization_id, code, title, kind, value)
  values (%L, 'BAD', 'x', 'percent', 150)$q$, (select org from ids)), '23514', 'percentages are at most 100');
select pg_temp.expect_error(format($q$insert into public.discounts (organization_id, code, title, kind, value, shop_ids)
  values (%L, 'XSHOP', 'x', 'fixed', 1, array[(select id from public.shops where organization_id = %L)])$q$,
  (select org from ids), (select org from o2)), '23514', 'shops must be this business''s');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert((select count(*) = 0 from public.discounts), 'other businesses see no discounts');
select pg_temp.expect_error(format($q$insert into public.discounts (organization_id, code, title, kind, value)
  values (%L, 'HACK', 'x', 'fixed', 1)$q$, (select org from ids)), '42501', 'other businesses cannot create them');
select pg_temp.act_as(null);
select pg_temp.expect_error($q$select * from public.discounts$q$, '42501', 'the public cannot list discounts');
select pg_temp.expect_error(format($q$select public.storefront_quote(%L, '[]')$q$, (select shop from ids)),
  '42501', 'quotes are server-only (they reveal codes)');

-- ---------------------------------------------------------------------------
-- Quotes
-- ---------------------------------------------------------------------------
create temp table cart on commit drop as select
  jsonb_build_array(jsonb_build_object('variant_id', (select tee_m from v), 'quantity', 2)) as two,
  jsonb_build_array(jsonb_build_object('variant_id', (select tee_m from v), 'quantity', 1)) as one;
create temp table addr on commit drop as select
  '{"name":"Asha Rao","phone":"+919800000001","line1":"12 MG Road","city":"Pune","state":"Maharashtra","postal_code":"411001"}'::jsonb as a;
grant select on cart, addr to service_role;

select pg_temp.as_server();
select pg_temp.assert(
  (select (q ->> 'discount_total')::numeric = 49.90 and q -> 'discount' ->> 'title' = 'Festive 5% off'
     and (q -> 'discount' ->> 'code') is null and (q ->> 'grand_total')::numeric = 998 - 49.90 + 49
   from (select public.storefront_quote((select shop from ids), (select two from cart)) q) x),
  'without a code, the best automatic offer applies');
select pg_temp.assert(
  (select (q ->> 'discount_total')::numeric = 99.80 and q -> 'discount' ->> 'code' = 'WELCOME10'
   from (select public.storefront_quote((select shop from ids), (select two from cart), 'welcome10') q) x),
  'a code (any case) replaces the automatic offer');
select pg_temp.assert(
  (select (public.storefront_quote((select shop from ids),
     jsonb_build_array(jsonb_build_object('variant_id', (select phone from v), 'quantity', 1)), 'WELCOME10') ->> 'discount_total')::numeric = 100),
  'percentage discounts respect their cap');
select pg_temp.assert(
  (select q ->> 'error' = 'This code isn''t valid' and (q ->> 'discount_total')::numeric = 0
   from (select public.storefront_quote((select shop from ids), (select two from cart), 'NOPE') q) x),
  'unknown codes explain themselves');
select pg_temp.assert(public.storefront_quote((select shop from ids), (select two from cart), 'SOON') ->> 'error' = 'This code isn''t active yet', 'scheduled');
select pg_temp.assert(public.storefront_quote((select shop from ids), (select two from cart), 'OLD') ->> 'error' = 'This code has expired', 'expired');
select pg_temp.assert(public.storefront_quote((select shop from ids), (select two from cart), 'UNUSED') ->> 'error' = 'This code isn''t valid', 'inactive');
select pg_temp.assert(
  public.storefront_quote((select shop from ids), (select one from cart), 'FLAT50') ->> 'error' = 'Add 1.00 INR more to use this code',
  'minimum order says how much more');
select pg_temp.assert(
  (select (q ->> 'shipping_total')::numeric = 0 and (q ->> 'saved')::numeric = 49
   from (select public.storefront_quote((select shop from ids), (select two from cart), 'FREESHIP') q) x),
  'free delivery removes the fee');
select pg_temp.assert(
  public.storefront_quote((select shop from ids), (select two from cart), 'WELCOME10', null) ->> 'error' is null,
  'quotes work before the shopper gives an email');

-- ---------------------------------------------------------------------------
-- Checkout with a code; GST on the discounted lines
-- ---------------------------------------------------------------------------
create temp table c1 on commit drop as select public.storefront_checkout_start((select shop from ids),
  (select two from cart), '{"name":"Asha","email":"asha@example.com","phone":"+919800000001"}', (select a from addr), 'cod', 'WELCOME10') as j;
grant select on c1 to service_role;
select pg_temp.assert((select (j ->> 'discount_total')::numeric = 99.80 and (j ->> 'grand_total')::numeric = 947.20 from c1),
  'checkout prices the code');
create temp table r1 on commit drop as
  select public.storefront_checkout_confirm((select (j ->> 'checkout_id')::uuid from c1), (select j ->> 'otp' from c1)) as j;
grant select on r1 to service_role, authenticated;
reset role;
select pg_temp.assert(
  (select o.discount_total = 99.80 and o.discount_code = 'WELCOME10' and o.grand_total = 947.20
     and o.tax_total = round((998 - 99.80) * 5 / 105, 2)
   from public.orders o where o.id = (select (j ->> 'order_id')::uuid from r1)),
  'the order carries the code, and GST is on the discounted price');
select pg_temp.assert(
  (select sum(discount_amount) = 99.80 from public.order_items where order_id = (select (j ->> 'order_id')::uuid from r1)),
  'the discount is spread over the lines');
select pg_temp.assert(
  (select amount = 99.80 from public.discount_redemptions where order_id = (select (j ->> 'order_id')::uuid from r1)),
  'the redemption is recorded');

-- ---------------------------------------------------------------------------
-- Limits
-- ---------------------------------------------------------------------------
select pg_temp.as_server();
-- Two shoppers start with the last use of ONLYONE; only the first to confirm gets it.
create temp table la on commit drop as select public.storefront_checkout_start((select shop from ids),
  (select one from cart), '{"name":"A","email":"a@example.com"}', (select a from addr), 'cod', 'ONLYONE') as j;
create temp table lb on commit drop as select public.storefront_checkout_start((select shop from ids),
  (select one from cart), '{"name":"B","email":"b@example.com"}', (select a from addr), 'cod', 'ONLYONE') as j;
grant select on la, lb to service_role;
select pg_temp.assert(
  (public.storefront_checkout_confirm((select (j ->> 'checkout_id')::uuid from la), (select j ->> 'otp' from la)) ->> 'ok')::boolean,
  'the first shopper gets the last use');
select pg_temp.expect_error(format($q$select public.storefront_checkout_confirm(%L, %L)$q$,
  (select j ->> 'checkout_id' from lb), (select j ->> 'otp' from lb)), '23514',
  'the second is told it has just been used up (and no order is created)');
reset role;
select pg_temp.assert((select count(*) = 0 from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'b@example.com'),
  'no order for the second shopper');
select pg_temp.as_server();
select pg_temp.assert(public.storefront_quote((select shop from ids), (select one from cart), 'ONLYONE') ->> 'error' = 'This code has been fully used', 'used up');

select pg_temp.assert(public.storefront_quote((select shop from ids), (select one from cart), 'FIRST', 'asha@example.com') ->> 'error'
  = 'This code is for first orders only', 'first order only: returning customers are refused');
select pg_temp.assert(public.storefront_quote((select shop from ids), (select one from cart), 'FIRST', 'new@example.com') ->> 'error' is null,
  'first order only: new customers are welcome');

create temp table p1 on commit drop as select public.storefront_checkout_start((select shop from ids),
  (select one from cart), '{"name":"Asha","email":"asha@example.com"}', (select a from addr), 'cod', 'PERONE') as j;
grant select on p1 to service_role;
select public.storefront_checkout_confirm((select (j ->> 'checkout_id')::uuid from p1), (select j ->> 'otp' from p1));
select pg_temp.assert(public.storefront_quote((select shop from ids), (select one from cart), 'PERONE', 'ASHA@example.com') ->> 'error'
  = 'You''ve already used this code', 'once per customer');
select pg_temp.assert(public.storefront_quote((select shop from ids), (select one from cart), 'PERONE', 'bob@example.com') ->> 'error' is null,
  'others can still use it');

-- Cancelling gives the use back.
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select public.cancel_order((select o.id from public.orders o join public.discounts d on d.id = o.discount_id where d.code = 'ONLYONE'));
select pg_temp.as_server();
select pg_temp.assert(public.storefront_quote((select shop from ids), (select one from cart), 'ONLYONE') ->> 'error' is null,
  'a cancelled order frees its use');

-- Free delivery records what it saved.
create temp table f1 on commit drop as select public.storefront_checkout_start((select shop from ids),
  (select one from cart), '{"name":"F","email":"f@example.com"}', (select a from addr), 'cod', 'FREESHIP') as j;
grant select on f1 to service_role;
create temp table fr on commit drop as
  select public.storefront_checkout_confirm((select (j ->> 'checkout_id')::uuid from f1), (select j ->> 'otp' from f1)) as j;
grant select on fr to service_role;
reset role;
select pg_temp.assert(
  (select o.shipping_total = 0 and o.discount_total = 0 and r.amount = 49
   from public.orders o join public.discount_redemptions r on r.order_id = o.id where o.id = (select (j ->> 'order_id')::uuid from fr)),
  'free delivery: no fee, saving recorded');

-- ---------------------------------------------------------------------------
-- Overview and housekeeping
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert(
  (select uses = 1 and total_saved = 99.80 and state = 'active' from public.discount_overview where code = 'WELCOME10')
  and (select state = 'scheduled' from public.discount_overview where code = 'SOON')
  and (select state = 'expired' from public.discount_overview where code = 'OLD')
  and (select state = 'inactive' from public.discount_overview where code = 'UNUSED'),
  'overview shows uses, savings and state');
select pg_temp.expect_error($q$delete from public.discounts where code = 'WELCOME10'$q$, '23503',
  'a used discount cannot be deleted (switch it off instead)');
delete from public.discounts where code = 'UNUSED';
select pg_temp.assert(not exists (select 1 from public.discounts where code = 'UNUSED'), 'an unused one can be deleted');

select 'ALL DISCOUNT TESTS PASSED' as result;
rollback;
