-- =============================================================================
-- Storefront catalogue, checkout with email OTP and customers.
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
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert(public.storefront_shop('mega-store') is null, 'other tenants cannot preview it');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
update public.shops
set status = 'live',
    settings = '{"tagline":"Everyday essentials","shipping_fee":49,"free_shipping_over":1000,"cod_limit":15000}'
where id = (select shop from ids);

-- ---------------------------------------------------------------------------
-- Catalogue (anonymous)
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null);
create temp table s on commit drop as select public.storefront_shop('MEGA-STORE') as j;
select pg_temp.assert((select j ->> 'tagline' = 'Everyday essentials' and (j ->> 'shipping_fee')::numeric = 49 from s),
  'live shop is public with its storefront settings');

select pg_temp.assert(
  (select (public.storefront_catalog((select shop from ids)) ->> 'total')::int = 2),
  'only active, published products are listed');
select pg_temp.assert(
  (select (public.storefront_catalog((select shop from ids), null, 'cotton') -> 'items' -> 0 ->> 'slug') = 'classic-tee'),
  'search matches tags');
select pg_temp.assert(
  (select (public.storefront_catalog((select shop from ids), null, '%') ->> 'total')::int = 0),
  'LIKE wildcards in searches are literal');
select pg_temp.assert(
  (select (x -> 'items' -> 0 ->> 'slug') = 'acme-x1' from (select public.storefront_catalog((select shop from ids), null, null, 'price_desc') x) t),
  'sorting by price');
select pg_temp.assert(jsonb_array_length(public.storefront_categories((select shop from ids))) = 2, 'categories with products');

create temp table p on commit drop as select public.storefront_product((select shop from ids), 'classic-tee') as j;
select pg_temp.assert(
  (select jsonb_array_length(j -> 'variants') = 2 and j -> 'axes' -> 0 ->> 'key' = 'size' from p),
  'product page lists variants and option axes');
select pg_temp.assert(
  (select (e ->> 'available')::int = 10 and (e ->> 'compare_at')::numeric = 699
   from p, jsonb_array_elements(j -> 'variants') e where e ->> 'sku' = 'TEE-M'),
  'stock is capped at 10 for display; compare-at price shown');
select pg_temp.assert(public.storefront_product((select shop from ids), 'secret-tee') is null
  and public.storefront_product((select shop from ids), 'hidden-tee') is null, 'draft and unpublished products 404');
select pg_temp.assert(
  jsonb_array_length(public.storefront_variants((select shop from ids),
    array[(select tee_m from v), (select id from public.product_variants where sku = 'TEE-H')])) = 1,
  'cart lookups ignore variants that are not for sale');

select pg_temp.expect_error(format($q$select public.storefront_checkout_start(%L, '[]', '{}', '{}')$q$, (select shop from ids)),
  '42501', 'the public cannot start checkouts directly (it returns the code)');
select pg_temp.expect_error($q$select * from public.customer_overview$q$, '42501', 'the public cannot list customers');

-- ---------------------------------------------------------------------------
-- Checkout (server)
-- ---------------------------------------------------------------------------
create temp table addr on commit drop as select
  '{"name":"Asha Rao","phone":"+919800000001","line1":"12 MG Road","city":"Pune","state":"Maharashtra","postal_code":"411001"}'::jsonb as a;
grant select on addr to service_role, anon, authenticated;

select pg_temp.as_server();
create temp table c1 on commit drop as select public.storefront_checkout_start((select shop from ids),
  jsonb_build_array(jsonb_build_object('variant_id', (select tee_m from v), 'quantity', 2, 'unit_price', 1)),
  '{"name":"Asha Rao","email":"Asha@Example.com","phone":"+91 98000 00001"}', (select a from addr)) as j;
select pg_temp.assert(
  (select j ->> 'otp' ~ '^[0-9]{6}$' and (j ->> 'subtotal')::numeric = 998 and (j ->> 'shipping_total')::numeric = 49
     and (j ->> 'grand_total')::numeric = 1047 and j ->> 'email' = 'asha@example.com' from c1),
  'checkout re-prices from the database (ignoring client prices) and adds shipping below the threshold');

select pg_temp.assert(
  (select (public.storefront_checkout_start((select shop from ids),
     jsonb_build_array(jsonb_build_object('variant_id', (select tee_m from v), 'quantity', 3)),
     '{"name":"B","email":"b@example.com"}', (select a from addr)) ->> 'shipping_total')::numeric = 0),
  'free shipping over the threshold');

select pg_temp.expect_error(format($q$select public.storefront_checkout_start(%L,
  jsonb_build_array(jsonb_build_object('variant_id', %L, 'quantity', 1)), '{"email":"c@example.com"}', %L)$q$,
  (select shop from ids), (select tee_l from v), (select a from addr)), '23514', 'out-of-stock items are refused');
select pg_temp.expect_error(format($q$select public.storefront_checkout_start(%L,
  jsonb_build_array(jsonb_build_object('variant_id', %L, 'quantity', 1)), '{"email":"c@example.com"}', %L)$q$,
  (select shop from ids), (select phone from v), (select a from addr)), '23514', 'orders above the COD limit are refused');
select pg_temp.expect_error(format($q$select public.storefront_checkout_start(%L,
  jsonb_build_array(jsonb_build_object('variant_id', %L, 'quantity', 1)), '{"email":"c@example.com"}', %L, 'upi')$q$,
  (select shop from ids), (select tee_m from v), (select a from addr)), '23514', 'only COD for now');
select pg_temp.expect_error(format($q$select public.storefront_checkout_start(%L,
  jsonb_build_array(jsonb_build_object('variant_id', %L, 'quantity', 1)), '{"email":"not-an-email"}', %L)$q$,
  (select shop from ids), (select tee_m from v), (select a from addr)), '23514', 'email is validated');

select pg_temp.expect_error(format($q$select public.storefront_checkout_resend(%L)$q$, (select (j ->> 'checkout_id')::uuid from c1)),
  '23514', 'resend is throttled');

select pg_temp.assert(
  (select (r ->> 'ok')::boolean = false and (r ->> 'attempts_left')::int = 4
   from (select public.storefront_checkout_confirm((select (j ->> 'checkout_id')::uuid from c1),
           case when (select j ->> 'otp' from c1) = '000000' then '111111' else '000000' end) as r) x),
  'a wrong code is counted');
create temp table r1 on commit drop as
  select public.storefront_checkout_confirm((select (j ->> 'checkout_id')::uuid from c1), (select j ->> 'otp' from c1)) as j;
grant select on r1 to anon, authenticated;
select pg_temp.assert((select (j ->> 'ok')::boolean and j ->> 'public_token' ~ '^[0-9a-f]{32}$' from r1), 'the right code places the order');
select pg_temp.assert(
  (select (public.storefront_checkout_confirm((select (j ->> 'checkout_id')::uuid from c1), '000000') ->> 'order_id')
          = (select j ->> 'order_id' from r1)),
  'confirming twice returns the same order (idempotent)');

reset role;
select pg_temp.assert(
  (select source = 'storefront' and status = 'confirmed' and payment_method = 'cod' and grand_total = 1047
     and shipping_total = 49 from public.orders where id = (select (j ->> 'order_id')::uuid from r1)),
  'storefront order is confirmed with COD and shipping');
select pg_temp.assert(
  (select reserved = 2 from public.inventory_levels where variant_id = (select tee_m from v)), 'stock reserved');
select pg_temp.assert(
  (select email_verified_at is not null and email::text = 'asha@example.com' and phone = '+919800000001'
   from public.customers where id = (select customer_id from public.orders where id = (select (j ->> 'order_id')::uuid from r1))),
  'customer created with a verified email');

-- Rate limit: five checkouts an hour per email.
select pg_temp.as_server();
select public.storefront_checkout_start((select shop from ids),
  jsonb_build_array(jsonb_build_object('variant_id', (select tee_m from v), 'quantity', 1)),
  '{"email":"asha@example.com"}', (select a from addr)) from generate_series(1, 4);
select pg_temp.expect_error(format($q$select public.storefront_checkout_start(%L,
  jsonb_build_array(jsonb_build_object('variant_id', %L, 'quantity', 1)), '{"email":"ASHA@example.com"}', %L)$q$,
  (select shop from ids), (select tee_m from v), (select a from addr)), '23514', 'checkouts are rate limited per email');

-- Five wrong codes lock the session.
create temp table c2 on commit drop as select public.storefront_checkout_start((select shop from ids),
  jsonb_build_array(jsonb_build_object('variant_id', (select tee_m from v), 'quantity', 1)),
  '{"email":"z@example.com"}', (select a from addr)) as j;
select public.storefront_checkout_confirm((select (j ->> 'checkout_id')::uuid from c2), '12345x') from generate_series(1, 5);
select pg_temp.assert(
  (select (public.storefront_checkout_confirm((select (j ->> 'checkout_id')::uuid from c2), (select j ->> 'otp' from c2)) ->> 'locked')::boolean),
  'locked after five wrong codes');

-- ---------------------------------------------------------------------------
-- Customer order page and admin overview
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null);
create temp table so on commit drop as select public.storefront_order((select j ->> 'public_token' from r1)) as j;
select pg_temp.assert(
  (select j ->> 'number' = 'ORD-000001' and jsonb_array_length(j -> 'items') = 1 and j -> 'ship_to' ->> 'city' = 'Pune'
     and j::text not like '%9800000001%' and j::text not like '%asha@%' from so),
  'order page shows the order without contact details');
select pg_temp.assert(public.storefront_order(repeat('0', 32)) is null, 'unknown order tokens reveal nothing');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert(
  (select orders_count = 1 and total_spent = 1047 from public.customer_overview where email = 'asha@example.com'),
  'customer overview aggregates orders');

-- Staff order entry still works through the shared core.
create temp table staff_order on commit drop as select public.create_order((select shop from ids), '{}', (select a from addr),
  jsonb_build_array(jsonb_build_object('variant_id', (select tee_m from v), 'quantity', 1)), 'upi') as id;
select pg_temp.assert((select source = 'admin' and status = 'confirmed' from public.orders where id = (select id from staff_order)),
  'staff orders are tagged admin and confirmed');

-- Shop handles are global (they are storefront addresses).
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select pg_temp.expect_error($q$select public.create_organization('Copycat', 'copycat', 'Copy', 'mega-store', 'INR',
  'WH', 'WH', 'Pune', array['fashion'])$q$, '23505', 'a second shop cannot take the same handle');

select 'ALL STOREFRONT & CHECKOUT TESTS PASSED' as result;
rollback;
