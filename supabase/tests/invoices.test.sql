-- =============================================================================
-- GST invoices: issued at dispatch, numbered per shop per financial year, snapshotted.
-- Runs in a transaction and rolls back.
-- =============================================================================
begin;

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  execute case when p_user is null then 'set local role anon' else 'set local role authenticated' end;
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

-- Stock level shorthand: "on_hand/reserved".
create function pg_temp.as_server() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  set local role service_role;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@retail.test', '{"full_name":"Owner"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'other@else.test', '{"full_name":"Other"}');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
create temp table o on commit drop as
  select (public.create_organization('Mega Retail', 'mega-retail', 'Mega Store', 'mega-store', 'INR',
          'Bengaluru WH', 'BLR', 'Bengaluru', array['fashion']) ->> 'organization_id')::uuid as org;
create temp table ids on commit drop as select
  (select org from o) as org,
  (select id from public.warehouses where organization_id = (select org from o)) as wh,
  (select id from public.shops where organization_id = (select org from o)) as shop;
update public.shops set order_prefix = 'MEGA', status = 'live',
  settings = '{"legal_name":"Mega Retail Pvt Ltd","gstin":"29ABCDE1234F1Z5","business_address":{"line1":"1 Residency Rd","city":"Bengaluru","state":"Karnataka","postal_code":"560025"}}'
where id = (select shop from ids);
update public.categories set gst_rate = 5, hsn_code = '6109' where slug = 'clothing' and organization_id = (select org from ids);

select public.create_product((select org from ids),
  jsonb_build_object('title', 'Tee', 'slug', 'tee', 'status', 'active',
    'category_id', (select id from public.categories where slug = 'clothing' and organization_id = (select org from ids))),
  '[{"sku":"TEE","price":525}]', array[(select shop from ids)]);
create temp table v on commit drop as select (select id from public.product_variants where sku = 'TEE') as tee;
select public.receive_stock((select tee from v), (select wh from ids), 10);

create temp table addr on commit drop as select
  '{"name":"Asha Rao","phone":"+919800000001","line1":"12 MG Road","city":"Pune","state":"Maharashtra","postal_code":"411001"}'::jsonb as a;
create temp table o1 on commit drop as select public.create_order((select shop from ids), '{"email":"asha@example.com"}',
  (select a from addr), jsonb_build_array(jsonb_build_object('variant_id', (select tee from v), 'quantity', 2)), 'cod', 'pending', 49) as id;
create temp table o2 on commit drop as select public.create_order((select shop from ids), '{"email":"asha@example.com"}',
  (select a from addr), jsonb_build_array(jsonb_build_object('variant_id', (select tee from v), 'quantity', 1)), 'cod') as id;
grant select on ids, o1, o2 to service_role;

-- ---------------------------------------------------------------------------
-- Financial year and HSN snapshot
-- ---------------------------------------------------------------------------
reset role;
create temp table fy on commit drop as select private.financial_year(now()) as y;
grant select on fy to authenticated, service_role;
select pg_temp.assert(private.financial_year('2026-10-27 12:00+05:30') = '2627', 'Oct 2026 is FY 26-27');
select pg_temp.assert(private.financial_year('2027-03-31 23:30+05:30') = '2627', '31 March is still the same year');
select pg_temp.assert(private.financial_year('2027-03-31 19:00+00') = '2728', 'year boundary uses India time');
select pg_temp.assert((select hsn_code = '6109' from public.order_items where order_id = (select id from o1)),
  'order lines keep the HSN code');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');

-- ---------------------------------------------------------------------------
-- Issue at dispatch
-- ---------------------------------------------------------------------------
select pg_temp.assert((select invoice_number is null from public.orders where id = (select id from o1)), 'no invoice before dispatch');
select pg_temp.assert(public.order_invoice((select id from o1)) is null, 'nothing to show yet');

create temp table s1 on commit drop as select public.create_shipment((select id from o1), (select wh from ids),
  jsonb_build_array(jsonb_build_object('order_item_id', (select id from public.order_items where order_id = (select id from o1)), 'quantity', 2))) as id;
select pg_temp.assert((select invoice_number is null from public.orders where id = (select id from o1)), 'packing is not dispatch');
select public.update_shipment_status((select id from s1), 'picked_up');
create temp table inv on commit drop as select public.order_invoice((select id from o1)) as j;
select pg_temp.assert(
  (select j ->> 'number' = 'MEGA' || (select y from fy) || '-00001'
     and char_length(j ->> 'number') <= 16
     and j -> 'seller' ->> 'gstin' = '29ABCDE1234F1Z5' and j -> 'seller' ->> 'state' = 'Karnataka'
     and j -> 'buyer' ->> 'line1' = '12 MG Road'
     and (j -> 'items' -> 0 ->> 'hsn_code') = '6109' and (j -> 'items' -> 0 ->> 'gst_rate')::numeric = 5
     and (j ->> 'grand_total')::numeric = 1099 from inv),
  'invoice issued on pickup, numbered per shop and year, with seller, buyer and HSN');
select public.update_shipment_status((select id from s1), 'in_transit');
select pg_temp.assert((select count(*) = 1 from public.order_events where order_id = (select id from o1) and type = 'invoice.issued'),
  'issued only once');

-- Settings edits don't rewrite an issued invoice.
update public.shops set settings = settings || '{"legal_name":"Renamed Ltd"}' where id = (select shop from ids);
select pg_temp.assert((public.order_invoice((select id from o1)) -> 'seller' ->> 'legal_name') = 'Mega Retail Pvt Ltd',
  'issued invoices are snapshots');

-- The next invoice takes the next number; completing an order also issues one.
reset role;
update public.orders set status = 'completed' where id = (select id from o2);
select pg_temp.assert((select invoice_number = 'MEGA' || (select y from fy) || '-00002' from public.orders where id = (select id from o2)),
  'completing an order issues its invoice with the next number');

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select pg_temp.expect_error(format($q$select public.order_invoice(%L)$q$, (select id from o1)), 'P0002',
  'other tenants cannot read the invoice');
select pg_temp.act_as(null);
select pg_temp.expect_error($q$select public.storefront_invoice(repeat('a', 32))$q$, '42501',
  'the public cannot call the invoice function directly');

select pg_temp.as_server();
create temp table pub on commit drop as
  select public.storefront_invoice((select public_token from public.orders where id = (select id from o1))) as j;
select pg_temp.assert((select j -> 'buyer' ->> 'city' = 'Pune' and (j -> 'buyer' ->> 'line1') is null and (j -> 'buyer' ->> 'phone') is null from pub),
  'by link alone, the street address and phone are left out');
select pg_temp.assert(
  (public.storefront_invoice((select public_token from public.orders where id = (select id from o1)), true) -> 'buyer' ->> 'line1') = '12 MG Road',
  'the owner sees the full address');
select pg_temp.assert(
  (select j ->> 'invoice_number' is not null and j ->> 'stage' = 'shipped'
   from (select public.storefront_order((select public_token from public.orders where id = (select id from o1))) j) x),
  'the order page knows the stage and that an invoice exists');

select pg_temp.assert(
  (public.storefront_order((select public_token from public.orders where id = (select id from o2))) ->> 'stage') = 'delivered',
  'a completed order reads as delivered (and a shipped one does not)');

select 'ALL INVOICE TESTS PASSED' as result;
rollback;
