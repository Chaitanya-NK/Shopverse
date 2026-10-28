-- =============================================================================
-- Analytics and GST reports: what counts as a sale, ranges in India time, access.
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
update public.categories set gst_rate = 5, hsn_code = '6109' where slug = 'clothing' and organization_id = (select org from ids);
select public.create_product((select org from ids),
  jsonb_build_object('title', 'Tee', 'slug', 'tee', 'status', 'active',
    'category_id', (select id from public.categories where slug = 'clothing' and organization_id = (select org from ids))),
  '[{"sku":"TEE","price":500}]', array[(select shop from ids)]);
create temp table v on commit drop as select (select id from public.product_variants where sku = 'TEE') as tee;
select public.receive_stock((select tee from v), (select wh from ids), 100);
grant select on ids, v to authenticated, service_role, anon;

create function pg_temp.order_of(p_qty int, p_state text, p_method public.payment_method, p_discount numeric default 0)
returns uuid language sql as $$
  select public.create_order((select shop from ids), jsonb_build_object('email', 'c' || p_qty || p_state || '@x.in'),
    jsonb_build_object('name','C','phone','+919800000001','line1','1 Rd','city','X','state',p_state,'postal_code','411001'),
    jsonb_build_array(jsonb_build_object('variant_id', (select tee from v), 'quantity', p_qty)), p_method, 'pending', 50, p_discount) $$;

-- Today: two sales (one with a discount) and one cancelled.
create temp table t on commit drop as select
  pg_temp.order_of(2, 'Maharashtra', 'cod') as a,
  pg_temp.order_of(1, 'Karnataka', 'upi', 100) as b,
  pg_temp.order_of(3, 'Karnataka', 'cod') as c;
grant select on t to authenticated, service_role;
select public.cancel_order((select c from t));
-- An online order still waiting for payment is not a sale; last week's sale is
-- the previous period.
create temp table later on commit drop as select
  pg_temp.order_of(5, 'Goa', 'online') as unpaid,
  pg_temp.order_of(4, 'Kerala', 'cod') as last_week;
reset role;
update public.orders set payment_due_at = now() + interval '30 minutes', status = 'pending'
where id = (select unpaid from later);
update public.orders set placed_at = now() - interval '7 days' where id = (select last_week from later);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');

create temp table r on commit drop as select public.sales_report((select org from ids),
  (now() at time zone 'Asia/Kolkata')::date - 6, (now() at time zone 'Asia/Kolkata')::date) as j;
grant select on r to authenticated;

select pg_temp.assert(
  (select (j -> 'totals' ->> 'orders')::int = 2
     and (j -> 'totals' ->> 'revenue')::numeric = (1000 + 50) + (500 - 100 + 50)
     and (j -> 'totals' ->> 'discounts')::numeric = 100
     and (j -> 'totals' ->> 'items')::int = 3
     and (j -> 'totals' ->> 'cancelled')::int = 1
     and (j -> 'totals' ->> 'cod_orders')::int = 1 and (j -> 'totals' ->> 'online_orders')::int = 1 from r),
  'sales exclude cancelled orders and unpaid online orders; revenue is what customers pay');
select pg_temp.assert(
  (select jsonb_array_length(j -> 'by_day') = 7 and (j -> 'by_day' -> 6 ->> 'orders')::int = 2 from r),
  'one point per day, zero-filled');
select pg_temp.assert(
  (select (j -> 'previous' ->> 'orders')::int = 1 and (j -> 'previous' ->> 'revenue')::numeric = 2050 from r),
  'the previous period is the same length just before (last week''s order)');
select pg_temp.assert(
  (select j -> 'top_products' -> 0 ->> 'title' = 'Tee' and (j -> 'top_products' -> 0 ->> 'revenue')::numeric = 1400 from r),
  'top products count revenue after discounts');
select pg_temp.assert(
  (select j -> 'by_state' -> 0 ->> 'state' = 'Maharashtra' and jsonb_array_length(j -> 'by_state') = 2 from r),
  'by state');
select pg_temp.expect_error(format($q$select public.sales_report(%L, '2026-01-02', '2026-01-01')$q$, (select org from ids)),
  '23514', 'ranges must run forwards');
select pg_temp.expect_error(format($q$select public.sales_report(%L, '2024-01-01', '2026-01-01')$q$, (select org from ids)),
  '23514', 'ranges are at most a year');

-- Other businesses see nothing (row-level security applies).
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert(
  (select (public.sales_report((select org from ids), current_date - 6, current_date) -> 'totals' ->> 'orders')::int = 0),
  'another business''s report is empty');
select pg_temp.expect_error(format($q$select public.gst_invoices(%L, current_date)$q$, (select org from ids)),
  '42501', 'and it cannot read their invoices');
select pg_temp.act_as(null);
select pg_temp.expect_error(format($q$select public.sales_report(%L, current_date, current_date)$q$, (select org from ids)),
  '42501', 'the public cannot run reports');

-- GST invoices: only issued ones, in the month.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select public.create_shipment((select a from t), (select wh from ids),
  jsonb_build_array(jsonb_build_object('order_item_id', (select id from public.order_items where order_id = (select a from t)), 'quantity', 2)));
select public.update_shipment_status((select id from public.shipments where order_id = (select a from t)), 'picked_up');
select pg_temp.assert(
  (select jsonb_array_length(x) = 1 and x -> 0 -> 'items' -> 0 ->> 'hsn_code' = '6109'
   from (select public.gst_invoices((select org from ids), (now() at time zone 'Asia/Kolkata')::date) x) y),
  'the month''s invoices, with HSN codes');
select pg_temp.assert(
  jsonb_array_length(public.gst_invoices((select org from ids), ((now() at time zone 'Asia/Kolkata') - interval '2 months')::date)) = 0,
  'other months are empty');

select 'ALL ANALYTICS TESTS PASSED' as result;
rollback;
