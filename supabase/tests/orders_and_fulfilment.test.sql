-- =============================================================================
-- Orders, routing, shipments, delivery OTP and public tracking.
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
create function pg_temp.level(p_sku text, p_wh uuid) returns text language sql as $$
  select coalesce((select il.on_hand || '/' || il.reserved from public.inventory_levels il
                   join public.product_variants v on v.id = il.variant_id
                   where v.sku = p_sku and il.warehouse_id = p_wh), '0/0') $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@retail.test', '{"full_name":"Owner"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'other@else.test', '{"full_name":"Other"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'support@retail.test', '{"full_name":"Support"}');

-- ---------------------------------------------------------------------------
-- Setup: two warehouses (BLR first, MUM second), three tracking modes
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
create temp table o on commit drop as
  select (public.create_organization('Mega Retail', 'mega-retail', 'Mega Store', 'mega-store', 'INR',
          'Bengaluru WH', 'BLR', 'Bengaluru', array['electronics', 'grocery', 'fashion']) ->> 'organization_id')::uuid as org;

create temp table ids on commit drop as select
  (select org from o) as org,
  (select id from public.warehouses where organization_id = (select org from o)) as wh1,
  (select id from public.shops where organization_id = (select org from o)) as shop;
insert into public.warehouses (organization_id, name, code) select org, 'Mumbai WH', 'MUM' from ids;
alter table ids add column wh2 uuid;
update ids set wh2 = (select id from public.warehouses where code = 'MUM' and organization_id = ids.org);
select public.set_warehouse_shops((select wh2 from ids), array[(select shop from ids)]);
update public.categories set gst_rate = 5 where slug = 'clothing' and organization_id = (select org from ids);

select public.create_product((select org from ids),
  jsonb_build_object('title', 'Acme X1', 'slug', 'acme-x1', 'status', 'active',
    'category_id', (select id from public.categories where slug = 'mobile-phones' and organization_id = (select org from ids)),
    'attributes', '{"brand":"Acme","model":"X1"}'::jsonb),
  '[{"sku":"X1","price":20000}]');
select public.create_product((select org from ids),
  jsonb_build_object('title', 'Oats', 'slug', 'oats', 'status', 'active',
    'category_id', (select id from public.categories where slug = 'packaged-food' and organization_id = (select org from ids)),
    'attributes', '{"diet":"Vegan"}'::jsonb),
  '[{"sku":"OATS","price":250}]');
select public.create_product((select org from ids),
  jsonb_build_object('title', 'Tee', 'slug', 'tee', 'status', 'active',
    'category_id', (select id from public.categories where slug = 'clothing' and organization_id = (select org from ids))),
  '[{"sku":"TEE","price":525}]');

create temp table v on commit drop as select
  (select id from public.product_variants where sku = 'X1') as phone,
  (select id from public.product_variants where sku = 'OATS') as oats,
  (select id from public.product_variants where sku = 'TEE') as tee;

select public.receive_stock((select phone from v), (select wh1 from ids), null, array['IMEI-1', 'IMEI-2']);
select public.receive_stock((select oats from v), (select wh1 from ids), 4, null, 'OLD', current_date - 1);
select public.receive_stock((select oats from v), (select wh1 from ids), 5, null, 'SOON', current_date + 10);
select public.receive_stock((select oats from v), (select wh1 from ids), 5, null, 'LATER', current_date + 90);
select public.receive_stock((select tee from v), (select wh1 from ids), 2);
select public.receive_stock((select tee from v), (select wh2 from ids), 5);

create temp table addr on commit drop as select
  '{"name":"Asha Rao","phone":"+919800000001","line1":"12 MG Road","city":"Pune","state":"Maharashtra","postal_code":"411001","country":"IN"}'::jsonb as a;

-- ---------------------------------------------------------------------------
-- create_order + routing
-- ---------------------------------------------------------------------------
-- 3 tees: no single warehouse has the phone AND 3 tees, so lines are split.
create temp table o1 on commit drop as select public.create_order(
  (select shop from ids), '{"full_name":"Asha Rao","email":"Asha@Example.com","phone":"+91 98000 00001"}',
  (select a from addr),
  jsonb_build_array(jsonb_build_object('variant_id', (select phone from v), 'quantity', 1),
                    jsonb_build_object('variant_id', (select tee from v), 'quantity', 3)),
  'cod', 'pending', 99, 525, 'Gift wrap') as id;

select pg_temp.assert((select status = 'confirmed' and number = 'ORD-000001' from public.orders where id = (select id from o1)),
  'order created, numbered and confirmed');
select pg_temp.assert(
  (select subtotal = 21575 and discount_total = 525 and shipping_total = 99 and grand_total = 21149
     and tax_total = 73.17 from public.orders where id = (select id from o1)),
  'totals: subtotal, discount, shipping; the discount is spread by value, so the 5% tee line keeps 1575 - 38.33 and its GST is 1536.67 * 5/105 = 73.17');
select pg_temp.assert(
  (select sum(discount_amount) = 525 and bool_and(discount_amount <= total) from public.order_items where order_id = (select id from o1)),
  'line discounts add up to the order discount');
select pg_temp.assert((select count(*) = 1 and min(email::text) = 'asha@example.com' and min(phone) = '+919800000001'
  from public.customers), 'customer created with normalised email and phone');
select pg_temp.assert(pg_temp.level('TEE', (select wh1 from ids)) = '2/2' and pg_temp.level('TEE', (select wh2 from ids)) = '5/1',
  'tee split: 2 reserved at the first warehouse, 1 at the second');
select pg_temp.assert(pg_temp.level('X1', (select wh1 from ids)) = '2/1', 'phone reserved at its warehouse');
select pg_temp.assert((select count(*) = 3 from public.order_allocations where order_id = (select id from o1)), 'three allocations');

-- Same customer again (matched on email) and a single warehouse that can ship everything.
create temp table o2 on commit drop as select public.create_order(
  (select shop from ids), '{"email":"asha@example.com"}', (select a from addr),
  jsonb_build_array(jsonb_build_object('variant_id', (select tee from v), 'quantity', 2, 'unit_price', 400)),
  'upi', 'paid') as id;
select pg_temp.assert((select count(*) = 1 from public.customers), 'returning customer is matched, not duplicated');
select pg_temp.assert(
  (select bool_and(warehouse_id = (select wh2 from ids)) from public.order_allocations where order_id = (select id from o2)),
  'a warehouse that can ship the whole order is preferred');
select pg_temp.assert((select grand_total = 800 and paid_at is not null from public.orders where id = (select id from o2)),
  'price override and paid status respected');

select pg_temp.expect_error(format($q$select public.create_order(%L, '{}', %L,
  jsonb_build_array(jsonb_build_object('variant_id', %L, 'quantity', 99)), 'upi')$q$,
  (select shop from ids), (select a from addr), (select tee from v)), '23514', 'cannot oversell');
select pg_temp.assert(pg_temp.level('TEE', (select wh2 from ids)) = '5/3' and (select count(*) = 2 from public.orders),
  'a failed order leaves nothing behind');
select pg_temp.expect_error(format($q$select public.create_order(%L, '{}', '{"name":"x"}',
  jsonb_build_array(jsonb_build_object('variant_id', %L, 'quantity', 1)), 'upi')$q$,
  (select shop from ids), (select tee from v)), '23514', 'address must be complete');
select pg_temp.expect_error(format($q$select public.create_order(%L, '{}', %L,
  jsonb_build_array(jsonb_build_object('variant_id', %L, 'quantity', 1)), 'upi', 'pending', 0, 999999)$q$,
  (select shop from ids), (select a from addr), (select tee from v)), '23514', 'discount cannot exceed subtotal');

-- Pending orders don't reserve; confirming does.
create temp table o3 on commit drop as select public.create_order(
  (select shop from ids), '{"phone":"+919811111111","full_name":"Ravi"}', (select a from addr),
  jsonb_build_array(jsonb_build_object('variant_id', (select oats from v), 'quantity', 7)),
  'card', 'pending', 0, 0, null, false) as id;
select pg_temp.assert((select status = 'pending' from public.orders where id = (select id from o3))
  and pg_temp.level('OATS', (select wh1 from ids)) = '14/0', 'pending order reserves nothing');
select public.confirm_order((select id from o3));
select pg_temp.assert(pg_temp.level('OATS', (select wh1 from ids)) = '14/7', 'confirming reserves');

-- ---------------------------------------------------------------------------
-- Shipments
-- ---------------------------------------------------------------------------
select pg_temp.expect_error(format($q$select public.create_shipment(%L, %L,
  jsonb_build_array(jsonb_build_object('order_item_id', (select id from public.order_items where order_id = %L and sku = 'X1'),
                                       'quantity', 1, 'serials', jsonb_build_array('IMEI-9'))))$q$,
  (select id from o1), (select wh1 from ids), (select id from o1)), '23514', 'serials must be in stock at the warehouse');
select pg_temp.expect_error(format($q$select public.create_shipment(%L, %L,
  jsonb_build_array(jsonb_build_object('order_item_id', (select id from public.order_items where order_id = %L and sku = 'TEE'),
                                       'quantity', 3)))$q$,
  (select id from o1), (select wh1 from ids), (select id from o1)), '23514', 'cannot ship more than is allocated to the warehouse');

create temp table s1 on commit drop as select public.create_shipment((select id from o1), (select wh1 from ids),
  jsonb_build_array(
    jsonb_build_object('order_item_id', (select id from public.order_items where order_id = (select id from o1) and sku = 'X1'),
                       'quantity', 1, 'serials', jsonb_build_array('imei-2')),
    jsonb_build_object('order_item_id', (select id from public.order_items where order_id = (select id from o1) and sku = 'TEE'),
                       'quantity', 2)),
  'Delhivery', 'dl123') as id;

select pg_temp.assert(pg_temp.level('X1', (select wh1 from ids)) = '1/0' and pg_temp.level('TEE', (select wh1 from ids)) = '0/0',
  'shipping consumes the reservation and the stock');
select pg_temp.assert((select status = 'sold' from public.inventory_serials where serial_number = 'IMEI-2'), 'the shipped unit is sold');
select pg_temp.assert(
  (select number = 'ORD-000001-1' and status = 'packed' and tracking_number = 'DL123' and tracking_token ~ '^[0-9a-f]{32}$'
     from public.shipments where id = (select id from s1)), 'shipment numbered, packed, with a tracking token');
select pg_temp.assert((select fulfillment_status = 'partially_fulfilled' from public.orders where id = (select id from o1)),
  'order partially fulfilled');

-- FEFO, skipping the expired batch
create temp table s3 on commit drop as select public.create_shipment((select id from o3), (select wh1 from ids),
  jsonb_build_array(jsonb_build_object('order_item_id', (select id from public.order_items where order_id = (select id from o3)),
                                       'quantity', 7))) as id;
select pg_temp.assert(
  (select string_agg(batch_code || ':' || on_hand, ',' order by batch_code) = 'LATER:3,OLD:4,SOON:0' from public.inventory_batches),
  'batches picked first-expiry-first-out, expired stock left alone');
select pg_temp.assert(
  (select jsonb_array_length(batches) = 2 from public.shipment_items where shipment_id = (select id from s3)),
  'the shipment records which batches left');

-- ---------------------------------------------------------------------------
-- Status flow and delivery OTP
-- ---------------------------------------------------------------------------
select pg_temp.expect_error(format($q$select public.update_shipment_status(%L, 'delivered')$q$, (select id from s1)),
  '23514', 'delivery needs the OTP');
select pg_temp.expect_error(format($q$select public.update_shipment_status(%L, 'out_for_delivery')$q$, (select id from s1)),
  '23514', 'cannot skip pickup');
select pg_temp.assert(public.update_shipment_status((select id from s1), 'picked_up', null, 'Bengaluru hub') is null,
  'pickup returns no code');
create temp table otp on commit drop as
  select public.update_shipment_status((select id from s1), 'out_for_delivery') as code;
select pg_temp.assert((select code ~ '^[0-9]{6}$' from otp), 'out for delivery issues a 6-digit OTP');

do $$
begin
  perform delivery_otp_hash from public.shipments;
  raise exception 'ASSERTION FAILED: the OTP hash must stay unreadable';
exception when insufficient_privilege then null;
end $$;
reset role;
select pg_temp.assert((select delivery_otp_hash like '$2a$%' and delivery_otp_hash <> (select code from otp)
  from public.shipments where id = (select id from s1)), 'only a bcrypt hash is stored');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');

select pg_temp.assert(
  (select (r ->> 'ok')::boolean = false and (r ->> 'attempts_left')::int = 4
   from (select public.confirm_delivery((select id from s1), case when (select code from otp) = '000000' then '111111' else '000000' end) as r) x),
  'a wrong code is counted');
select pg_temp.assert((public.confirm_delivery((select id from s1), (select code from otp)) ->> 'ok')::boolean,
  'the right code delivers');
select pg_temp.assert((select status = 'delivered' and delivered_at is not null from public.shipments where id = (select id from s1)),
  'shipment delivered');
select pg_temp.assert((select status = 'confirmed' from public.orders where id = (select id from o1)),
  'order not complete while a line is still waiting');

-- Ship and deliver the last tee from Mumbai: the COD order completes and is paid.
create temp table s2 on commit drop as select public.create_shipment((select id from o1), (select wh2 from ids),
  jsonb_build_array(jsonb_build_object('order_item_id',
    (select id from public.order_items where order_id = (select id from o1) and sku = 'TEE'), 'quantity', 1))) as id;
select public.update_shipment_status((select id from s2), 'picked_up');
select public.update_shipment_status((select id from s2), 'in_transit', 'Reached Pune hub', 'Pune');
select public.update_shipment_status((select id from s2), 'out_for_delivery');
select public.update_shipment_status((select id from s2), 'failed_attempt', 'Customer not home');
create temp table otp2 on commit drop as select public.update_shipment_status((select id from s2), 'out_for_delivery') as code;
select pg_temp.assert((select delivery_attempts = 2 from public.shipments where id = (select id from s2)), 'attempts counted');
select public.confirm_delivery((select id from s2), (select code from otp2));
select pg_temp.assert(
  (select status = 'completed' and fulfillment_status = 'fulfilled' and payment_status = 'paid' and completed_at is not null
   from public.orders where id = (select id from o1)), 'COD order completes and is marked paid on final delivery');
select pg_temp.assert((select count(*) >= 8 from public.order_events where order_id = (select id from o1)), 'timeline recorded');

-- OTP lockout
create temp table o4 on commit drop as select public.create_order((select shop from ids), '{}', (select a from addr),
  jsonb_build_array(jsonb_build_object('variant_id', (select phone from v), 'quantity', 1)), 'upi', 'paid') as id;
create temp table s4 on commit drop as select public.create_shipment((select id from o4), (select wh1 from ids),
  jsonb_build_array(jsonb_build_object('order_item_id', (select id from public.order_items where order_id = (select id from o4)),
                                       'quantity', 1, 'serials', jsonb_build_array('IMEI-1')))) as id;
select public.update_shipment_status((select id from s4), 'picked_up');
create temp table otp4 on commit drop as select public.update_shipment_status((select id from s4), 'out_for_delivery') as code;
select public.confirm_delivery((select id from s4), 'abc') from generate_series(1, 5);
select pg_temp.assert(
  (public.confirm_delivery((select id from s4), (select code from otp4)) ->> 'ok')::boolean = false,
  'after five wrong codes even the right one is refused');

-- Returned to origin: stock comes back as a return; the order shows returned and can be cancelled.
select public.update_shipment_status((select id from s4), 'returned_to_origin', 'Refused by customer');
select pg_temp.assert(pg_temp.level('X1', (select wh1 from ids)) = '1/0'
  and (select status = 'in_stock' from public.inventory_serials where serial_number = 'IMEI-1'),
  'returned unit is back in stock');
select pg_temp.assert((select fulfillment_status = 'returned' from public.orders where id = (select id from o4)), 'order shows returned');
select public.cancel_order((select id from o4), 'Customer refused delivery');
select pg_temp.assert((select status = 'cancelled' and cancel_reason = 'Customer refused delivery' from public.orders where id = (select id from o4)),
  'returned order can be cancelled');

-- Cancelled before pickup: goods are restocked and reserved again for the order.
create temp table s5 on commit drop as select public.create_shipment((select id from o2), (select wh2 from ids),
  jsonb_build_array(jsonb_build_object('order_item_id', (select id from public.order_items where order_id = (select id from o2)),
                                       'quantity', 2))) as id;
select pg_temp.assert(pg_temp.level('TEE', (select wh2 from ids)) = '2/0', 'packed: stock out');
select pg_temp.expect_error(format($q$select public.cancel_order(%L)$q$, (select id from o2)), '23514',
  'cannot cancel an order with a live shipment');
select public.update_shipment_status((select id from s5), 'cancelled', 'Wrong size packed');
select pg_temp.assert(pg_temp.level('TEE', (select wh2 from ids)) = '4/2'
  and (select fulfillment_status = 'unfulfilled' from public.orders where id = (select id from o2)),
  'cancelled parcel: stock back on the shelf and reserved for the order again');
select public.cancel_order((select id from o2), 'Changed mind');
select pg_temp.assert(pg_temp.level('TEE', (select wh2 from ids)) = '4/0', 'cancelling releases the reservation');
select pg_temp.assert((select coalesce(sum(quantity - shipped_quantity), 0) = 0 from public.order_allocations where order_id = (select id from o2)),
  'nothing left allocated');

-- ---------------------------------------------------------------------------
-- Access control and public tracking
-- ---------------------------------------------------------------------------
do $$
begin
  update public.orders set status = 'completed';
  raise exception 'ASSERTION FAILED: order status must not be writable directly';
exception when insufficient_privilege then null;
end $$;
update public.orders set notes = 'Call before delivery' where id = (select id from o3);
select pg_temp.assert((select notes = 'Call before delivery' from public.orders where id = (select id from o3)),
  'staff can edit the internal note');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert((select count(*) = 0 from public.order_overview), 'other tenants see no orders');
select pg_temp.expect_error(format($q$select public.cancel_order(%L)$q$, (select id from o3)), 'P0002',
  'other tenants cannot even find the order');

reset role;
insert into public.organization_members (organization_id, user_id, role)
select org, '00000000-0000-0000-0000-0000000000c1', 'support' from ids;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect_error(format($q$select public.create_order(%L, '{}', %L,
  jsonb_build_array(jsonb_build_object('variant_id', %L, 'quantity', 1)), 'upi')$q$,
  (select shop from ids), (select a from addr), (select tee from v)), '42501', 'support staff cannot create orders');

reset role;
create temp table tok on commit drop as select tracking_token from public.shipments where id = (select id from s1);
grant select on tok to anon;
select pg_temp.act_as(null);
create temp table tr on commit drop as select public.get_tracking((select tracking_token from tok)) as t;
select pg_temp.assert(
  (select t ->> 'status' = 'delivered' and t ->> 'order_number' = 'ORD-000001' and t ->> 'destination' = 'Pune, Maharashtra'
     and jsonb_array_length(t -> 'events') >= 4 and t::text not like '%9800000001%' and t::text not like '%Asha%' from tr),
  'anyone with the link sees the journey but no personal details');
select pg_temp.assert(public.get_tracking('not-a-token') is null and public.get_tracking(repeat('a', 32)) is null,
  'unknown tokens reveal nothing');
select pg_temp.expect_error($q$select * from public.order_overview$q$, '42501', 'anonymous users cannot list orders');

select 'ALL ORDER & FULFILMENT TESTS PASSED' as result;
rollback;
