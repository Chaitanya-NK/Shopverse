-- =============================================================================
-- Operations: suppliers, purchase orders, low-stock alerts, digest, couriers.
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

create function pg_temp.as_server() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  set local role service_role;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@retail.test', '{"full_name":"Owner"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'staff@retail.test', '{"full_name":"Staff"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'other@else.test', '{"full_name":"Other"}');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
create temp table o on commit drop as
  select (public.create_organization('Mega Retail', 'mega-retail', 'Mega Store', 'mega-store', 'INR',
          'Bengaluru WH', 'BLR', 'Bengaluru', array['fashion', 'electronics', 'grocery']) ->> 'organization_id')::uuid as org;
create temp table ids on commit drop as select
  (select org from o) as org,
  (select id from public.warehouses where organization_id = (select org from o)) as wh,
  (select id from public.shops where organization_id = (select org from o)) as shop;
reset role;
insert into public.organization_members (organization_id, user_id, role)
values ((select org from ids), '00000000-0000-0000-0000-0000000000a2', 'staff');
create temp table fy on commit drop as select private.financial_year(now()) as y;
grant select on fy to authenticated, service_role;
update public.shops set order_prefix = 'MEGA', status = 'live',
  settings = '{"legal_name":"Mega Retail Pvt Ltd","gstin":"29ABCDE1234F1Z5","business_address":{"line1":"1 Residency Rd","city":"Bengaluru","state":"Karnataka","postal_code":"560025"}}'
where id = (select shop from ids);
update public.categories set gst_rate = 5, hsn_code = '6109' where slug = 'clothing' and organization_id = (select org from ids);
update public.categories set gst_rate = 12, returnable = false where slug = 'packaged-food' and organization_id = (select org from ids);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');

select public.create_product((select org from ids),
  jsonb_build_object('title', 'Tee', 'slug', 'tee', 'status', 'active',
    'category_id', (select id from public.categories where slug = 'clothing' and organization_id = (select org from ids))),
  '[{"sku":"TEE-M","price":500,"title":"M","options":{"size":"M"}},{"sku":"TEE-L","price":500,"title":"L","options":{"size":"L"}}]', array[(select shop from ids)]);
select public.create_product((select org from ids),
  jsonb_build_object('title', 'Oats', 'slug', 'oats', 'status', 'active', 'attributes', '{"diet":"Vegan"}'::jsonb,
    'category_id', (select id from public.categories where slug = 'packaged-food' and organization_id = (select org from ids))),
  '[{"sku":"OATS","price":500}]', array[(select shop from ids)]);
create temp table v on commit drop as select
  (select id from public.product_variants where sku = 'TEE-M') as m,
  (select id from public.product_variants where sku = 'TEE-L') as l,
  (select id from public.product_variants where sku = 'OATS') as oats;
reset role;
update public.products set tracking = 'quantity' where slug = 'tee';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select public.receive_stock((select m from v), (select wh from ids), 10);
select public.receive_stock((select l from v), (select wh from ids), 10);
select public.receive_stock((select oats from v), (select wh from ids), 10, null, 'B1', current_date + 60);
grant select on ids, v to authenticated, service_role, anon;

select public.create_product((select org from ids),
  jsonb_build_object('title', 'Phone', 'slug', 'phone', 'status', 'active', 'attributes', '{"brand":"Acme","model":"X1"}'::jsonb,
    'category_id', (select id from public.categories where slug = 'mobile-phones' and organization_id = (select org from ids))),
  '[{"sku":"PHONE-1","price":20000}]', array[(select shop from ids)]);
reset role;
create temp table v2 on commit drop as select (select id from public.product_variants where sku = 'PHONE-1') as phone;
grant select on v2 to authenticated, service_role, anon;
select pg_temp.assert((select tracking = 'serial' from public.products where slug = 'phone'), 'phones are serial tracked');

-- ---------------------------------------------------------------------------
-- Suppliers
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_error(format($q$insert into public.suppliers (organization_id, name) values (%L, 'Nope')$q$, (select org from ids)),
  '42501', 'staff cannot add suppliers');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
insert into public.suppliers (organization_id, name, email, gstin)
values ((select org from ids), 'Tiruppur Knits', 'orders@knits.test', '33ABCDE1234F1Z5');
select pg_temp.expect_error(format($q$insert into public.suppliers (organization_id, name) values (%L, 'tiruppur knits')$q$, (select org from ids)),
  '23505', 'supplier names are unique per business');
select pg_temp.expect_error(format($q$insert into public.suppliers (organization_id, name, gstin) values (%L, 'Bad', 'XX')$q$, (select org from ids)),
  '23514', 'GSTIN is checked');
create temp table sup on commit drop as select id from public.suppliers where name = 'Tiruppur Knits';
grant select on sup to authenticated, service_role, anon;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert((select count(*) from public.suppliers) = 0, 'outsiders see no suppliers');

-- ---------------------------------------------------------------------------
-- Purchase orders
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_error(format($q$select public.save_purchase_order(%L, null, %L, %L, '[{"variant_id":"%s","quantity":5,"unit_cost":200}]')$q$,
  (select org from ids), (select id from sup), (select wh from ids), (select m from v)), '42501', 'staff cannot write purchase orders');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error(format($q$select public.save_purchase_order(%L, null, %L, %L, '[]')$q$,
  (select org from ids), (select id from sup), (select wh from ids)), '23514', 'needs lines');
select pg_temp.expect_error(format($q$select public.save_purchase_order(%L, null, %L, %L, '[{"variant_id":"%s","quantity":1,"unit_cost":1},{"variant_id":"%s","quantity":2,"unit_cost":1}]')$q$,
  (select org from ids), (select id from sup), (select wh from ids), (select m from v), (select m from v)), '23514', 'no duplicate lines');
create temp table po on commit drop as select public.save_purchase_order((select org from ids), null, (select id from sup), (select wh from ids),
  jsonb_build_array(
    jsonb_build_object('variant_id', (select m from v), 'quantity', 20, 'unit_cost', 210.50, 'tax_rate', 5),
    jsonb_build_object('variant_id', (select oats from v), 'quantity', 10, 'unit_cost', 150, 'tax_rate', 12),
    jsonb_build_object('variant_id', (select phone from v2), 'quantity', 2, 'unit_cost', 15000, 'tax_rate', 18)),
  current_date + 3, 'SO-991', 'Deliver to the back gate') as id;
grant select on po to authenticated, service_role;
select pg_temp.assert((select number = 'PO-000001' and status = 'draft' and subtotal = 35710 and tax_total = 5790.50 and total = 41500.50
                       from public.purchase_orders where id = (select id from po)), 'numbered draft with totals');

-- Drafts can be edited; placed orders can't.
select public.save_purchase_order((select org from ids), (select id from po), (select id from sup), (select wh from ids),
  jsonb_build_array(
    jsonb_build_object('variant_id', (select m from v), 'quantity', 20, 'unit_cost', 200, 'tax_rate', 5),
    jsonb_build_object('variant_id', (select oats from v), 'quantity', 10, 'unit_cost', 150, 'tax_rate', 12),
    jsonb_build_object('variant_id', (select phone from v2), 'quantity', 2, 'unit_cost', 15000, 'tax_rate', 18)),
  current_date + 3, 'SO-991', null);
select pg_temp.assert((select total from public.purchase_orders where id = (select id from po)) = 41280, 'edited totals');
select pg_temp.expect_error(format($q$select public.receive_purchase_order(%L, '[]')$q$, (select id from po)), '23514', 'drafts cannot be received');
select public.place_purchase_order((select id from po));
select pg_temp.assert((select status = 'ordered' and ordered_at is not null from public.purchase_orders where id = (select id from po)), 'placed');
select pg_temp.expect_error(format($q$select public.save_purchase_order(%L, %L, %L, %L, '[{"variant_id":"%s","quantity":1,"unit_cost":1}]')$q$,
  (select org from ids), (select id from po), (select id from sup), (select wh from ids), (select m from v)), '23514', 'placed orders are locked');

create temp table poi on commit drop as select
  (select id from public.purchase_order_items where purchase_order_id = (select id from po) and variant_id = (select m from v)) as tee,
  (select id from public.purchase_order_items where purchase_order_id = (select id from po) and variant_id = (select oats from v)) as oats,
  (select id from public.purchase_order_items where purchase_order_id = (select id from po) and variant_id = (select phone from v2)) as phone;
grant select on poi to authenticated, service_role;

-- Staff receive part of it.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_error(format($q$select public.receive_purchase_order(%L, '[{"item_id":"%s","quantity":21}]')$q$,
  (select id from po), (select tee from poi)), '23514', 'cannot receive more than ordered');
select pg_temp.expect_error(format($q$select public.receive_purchase_order(%L, '[{"item_id":"%s","quantity":4}]')$q$,
  (select id from po), (select oats from poi)), '23514', 'batch products need a batch code');
select public.receive_purchase_order((select id from po), jsonb_build_array(
  jsonb_build_object('item_id', (select tee from poi), 'quantity', 12),
  jsonb_build_object('item_id', (select oats from poi), 'quantity', 10, 'batch_code', 'b77', 'expiry_date', (current_date + 120)::text),
  jsonb_build_object('item_id', (select phone from poi), 'serials', jsonb_build_array('IMEI0001', 'IMEI0002'))));
select pg_temp.assert((select status = 'partially_received' from public.purchase_orders where id = (select id from po)), 'partly received');
select pg_temp.assert((select on_hand from public.inventory_levels where variant_id = (select m from v)) = 22, 'tee stock 10 + 12');
select pg_temp.assert(exists (select 1 from public.inventory_batches where batch_code = 'B77' and on_hand = 10), 'batch created');
select pg_temp.assert((select count(*) from public.inventory_serials where serial_number in ('IMEI0001', 'IMEI0002')) = 2, 'serials in stock');
select pg_temp.assert((select cost_price from public.product_variants where id = (select m from v)) = 200, 'latest cost recorded');
select pg_temp.assert((select count(*) from public.stock_movements where reference_type = 'purchase_order' and reference_id = (select id from po)) = 3,
  'movements linked to the PO');
select pg_temp.expect_error(format($q$select public.close_purchase_order(%L)$q$, (select id from po)), '42501', 'staff cannot close');

-- The rest never comes: close it.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert(public.close_purchase_order((select id from po)) = 'closed', 'closed with a shortfall');
select pg_temp.assert((select ordered_quantity = 32 and received_quantity = 24 and supplier_name = 'Tiruppur Knits'
                       from public.purchase_order_overview where id = (select id from po)), 'overview');
-- A draft with nothing received is cancelled instead.
create temp table po2 on commit drop as select public.save_purchase_order((select org from ids), null, (select id from sup), (select wh from ids),
  jsonb_build_array(jsonb_build_object('variant_id', (select l from v), 'quantity', 5, 'unit_cost', 200))) as id;
select pg_temp.assert(public.close_purchase_order((select id from po2)) = 'cancelled', 'cancelled');
select pg_temp.assert((select number from public.purchase_orders where id = (select id from po2)) = 'PO-000002', 'numbers keep counting');

-- ---------------------------------------------------------------------------
-- Low-stock alerts and reorder suggestions
-- ---------------------------------------------------------------------------
reset role;
update public.inventory_levels set reorder_point = 20 where variant_id = (select m from v);
select pg_temp.assert(not exists (select 1 from public.stock_alerts where variant_id = (select m from v)), 'above the point: no alert');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select public.adjust_stock((select m from v), (select wh from ids), -3, 'damage');
select pg_temp.assert((select available = 19 and reorder_point = 20 from public.stock_alerts
                       where variant_id = (select m from v) and resolved_at is null), 'alert opens at the point');
select public.adjust_stock((select m from v), (select wh from ids), -1, 'damage');
select pg_temp.assert((select count(*) from public.stock_alerts where variant_id = (select m from v)) = 1, 'one open alert, updated');
select pg_temp.assert((select available from public.stock_alerts where variant_id = (select m from v)) = 18, 'keeps the latest level');
select pg_temp.assert(
  (select (x ->> 'suggested')::int = 22 and x ->> 'supplier_name' = 'Tiruppur Knits' and (x ->> 'unit_cost')::numeric = 200
   from jsonb_array_elements(public.reorder_suggestions((select org from ids))) x where x ->> 'sku' = 'TEE-M'),
  'suggests 2 x 20 - 18, with the last supplier and price');

-- Emails: claimed once, released on failure.
select pg_temp.as_server();
create temp table claimed on commit drop as select public.claim_stock_alerts() as j;
select pg_temp.assert((select jsonb_array_length(j -> 0 -> 'items') from claimed) = 1, 'one alert to email');
select pg_temp.assert(public.claim_stock_alerts() = '[]'::jsonb, 'not claimed twice');
select public.release_stock_alerts(array[(select (j -> 0 -> 'items' -> 0 ->> 'alert_id')::uuid from claimed)]);
select pg_temp.assert(jsonb_array_length(public.claim_stock_alerts()) = 1, 'released alerts come back');
select pg_temp.assert(public.operations_contacts((select org from ids)) -> 'emails' = '["owner@retail.test"]'::jsonb,
  'owners, admins and managers by default (not staff)');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select public.receive_stock((select m from v), (select wh from ids), 5);
select pg_temp.assert((select resolved_at is not null from public.stock_alerts where variant_id = (select m from v)), 'restocking resolves it');

-- Settings
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_error(format($q$select public.save_operations_settings(%L, true, true, 9, '{owner}', null)$q$, (select org from ids)),
  '42501', 'staff cannot change settings');
select pg_temp.assert((public.get_operations_settings((select org from ids)) ->> 'digest_hour')::int = 8, 'defaults');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select public.save_operations_settings((select org from ids), true, true, 9, '{owner,staff}', 'test');
select pg_temp.as_server();
select pg_temp.assert(public.operations_contacts((select org from ids)) -> 'emails' @> '["staff@retail.test"]'::jsonb, 'recipients follow the roles');

-- Digest: due once a day after its hour (India time).
select pg_temp.assert(not (public.claim_due_digests((current_date::timestamp + interval '8 hours') at time zone 'Asia/Kolkata')
                           @> to_jsonb((select org from ids))), 'not before 9am');
select pg_temp.assert(public.claim_due_digests((current_date::timestamp + interval '9 hours 5 minutes') at time zone 'Asia/Kolkata')
                      @> to_jsonb((select org from ids)), 'due at 9');
select pg_temp.assert(not (public.claim_due_digests((current_date::timestamp + interval '10 hours') at time zone 'Asia/Kolkata')
                           @> to_jsonb((select org from ids))), 'once a day');
select pg_temp.assert(((public.service_operations_digest((select org from ids)) -> 'purchase_orders') ->> 'overdue')::int = 0, 'digest builds');

-- ---------------------------------------------------------------------------
-- Couriers
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
create temp table addr on commit drop as select
  '{"name":"Asha Rao","phone":"+919800000001","line1":"12 MG Road","city":"Pune","state":"Maharashtra","postal_code":"411001"}'::jsonb as a;
create temp table oa on commit drop as select public.create_order((select shop from ids), '{"email":"asha@example.com","full_name":"Asha"}',
  (select a from addr), jsonb_build_array(jsonb_build_object('variant_id', (select m from v), 'quantity', 2)), 'cod', 'pending', 49, 0) as id;
create temp table sa on commit drop as select public.create_shipment((select id from oa), (select wh from ids),
  jsonb_build_array(jsonb_build_object('order_item_id', (select id from public.order_items where order_id = (select id from oa)), 'quantity', 2))) as id;
grant select on oa, sa to authenticated, service_role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_error(format($q$select public.record_courier_booking(%L, 'test', 'Test Courier', 'express', 'bad awb!', 90, null, '{}', 0)$q$,
  (select id from sa)), '23514', 'AWBs are checked');
select public.record_courier_booking((select id from sa), 'test', 'Shopverse Test Courier', 'express', 'SVT1234567890', 92.40,
  now() + interval '2 days', '{"weight_grams":600}', 1049);
select pg_temp.assert((select tracking_number = 'SVT1234567890' and shipping_cost = 92.40 and cod_amount = 1049 and status = 'packed'
                       from public.shipments where id = (select id from sa)), 'booked');
select pg_temp.expect_error(format($q$select public.record_courier_booking(%L, 'test', 'X', 'surface', 'SVT0000000001', 1, null, '{}', 0)$q$,
  (select id from sa)), '23514', 'booked only once');
select pg_temp.assert((public.shipment_document((select id from sa)) -> 'shipment' ->> 'awb') = 'SVT1234567890', 'label data');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert(public.shipment_document((select id from sa)) is null, 'outsiders get no label');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_error(format($q$select public.courier_shipment_update('test', 'SVT1234567890', 'picked_up', 'e1')$q$),
  '42501', 'only the server applies courier updates');

select pg_temp.as_server();
select pg_temp.assert((public.courier_shipment_update('test', 'NOPE', 'picked_up', 'e0') ->> 'applied')::boolean = false, 'unknown AWB ignored');
select pg_temp.assert((public.courier_shipment_update('test', 'SVT1234567890', 'picked_up', 'e1', 'Picked up', 'Bengaluru') ->> 'applied')::boolean,
  'picked up');
select pg_temp.assert((public.courier_shipment_update('test', 'SVT1234567890', 'picked_up', 'e1') ->> 'reason') = 'duplicate', 'idempotent');
select pg_temp.assert((public.courier_shipment_update('test', 'SVT1234567890', 'in_transit', 'e2', 'At hub', 'Pune') ->> 'applied')::boolean, 'in transit');
select pg_temp.assert((public.courier_shipment_update('test', 'SVT1234567890', 'picked_up', 'e2b') ->> 'applied')::boolean = false,
  'going backwards is only history');
select public.courier_shipment_update('test', 'SVT1234567890', 'out_for_delivery', 'e3');
select public.courier_shipment_update('test', 'SVT1234567890', 'delivered', 'e4', 'Delivered to Asha');
reset role;
select pg_temp.assert((select s.status = 'delivered' and s.delivered_at is not null and o.status = 'completed' and o.payment_status = 'paid'
                       from public.shipments s join public.orders o on o.id = s.order_id where s.id = (select id from sa)),
  'courier delivery completes the order and settles cash on delivery');
select pg_temp.assert((select count(*) from public.shipment_events where shipment_id = (select id from sa) and external_id is not null) = 5,
  'every courier scan is history');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_error(format($q$select public.clear_courier_booking(%L)$q$, (select id from sa)), '23514', 'cannot cancel after pickup');

\echo ALL OPERATIONS TESTS PASSED
rollback;
