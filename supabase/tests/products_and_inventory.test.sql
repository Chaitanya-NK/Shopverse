-- =============================================================================
-- Products, attribute validation and tracked inventory (serial / batch).
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

-- Expect a statement to fail with a given SQLSTATE.
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
  ('00000000-0000-0000-0000-0000000000b1', 'other@else.test', '{"full_name":"Other"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'support@retail.test', '{"full_name":"Support"}');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
create temp table o on commit drop as
  select (public.create_organization('Mega Retail', 'mega-retail', 'Mega Store', 'mega-store', 'INR',
          'Bengaluru WH', 'BLR', 'Bengaluru', array['electronics', 'grocery', 'fashion']) ->> 'organization_id')::uuid as org;
grant all on o to authenticated;

create temp table ids on commit drop as select
  (select org from o) as org,
  (select id from public.warehouses where organization_id = (select org from o)) as wh1,
  (select id from public.categories where slug = 'mobile-phones' and organization_id = (select org from o)) as phones,
  (select id from public.categories where slug = 'packaged-food' and organization_id = (select org from o)) as food,
  (select id from public.categories where slug = 'clothing' and organization_id = (select org from o)) as clothing,
  (select id from public.shops where organization_id = (select org from o)) as shop;
grant all on ids to authenticated;

insert into public.warehouses (organization_id, name, code) select org, 'Mumbai WH', 'MUM' from ids;
alter table ids add column wh2 uuid;
update ids set wh2 = (select id from public.warehouses where code = 'MUM' and organization_id = ids.org);

-- ---------------------------------------------------------------------------
-- Attribute validation
-- ---------------------------------------------------------------------------
select pg_temp.expect_error(format($q$
  select public.create_product(%L, '{"title":"Phone","slug":"phone","category_id":"%s","attributes":{"model":"X1"}}',
    '[{"sku":"PH-1","price":100}]')$q$, (select org from ids), (select phones from ids)),
  '23514', 'required attribute (brand) is enforced');

select pg_temp.expect_error(format($q$
  select public.create_product(%L, '{"title":"Phone","slug":"phone","category_id":"%s","attributes":{"brand":"Acme","model":"X1","colour":"Red"}}',
    '[{"sku":"PH-1","price":100}]')$q$, (select org from ids), (select phones from ids)),
  '23514', 'a variant option cannot be stored as a product detail');

select pg_temp.expect_error(format($q$
  select public.create_product(%L, '{"title":"Phone","slug":"phone","category_id":"%s","attributes":{"brand":"Acme","model":"X1"}}',
    '[{"sku":"PH-1","price":100,"options":{"storage":"3 TB"}}]')$q$, (select org from ids), (select phones from ids)),
  '23514', 'select options are enforced on variants');

select pg_temp.expect_error(format($q$
  select public.create_product(%L, '{"title":"Phone","slug":"phone","category_id":"%s","attributes":{"brand":"Acme","model":"X1","warranty_months":"twelve"}}',
    '[{"sku":"PH-1","price":100}]')$q$, (select org from ids), (select phones from ids)),
  '23514', 'number attributes must be numbers');

select pg_temp.expect_error(format($q$
  select public.create_product(%L, '{"title":"Phone","slug":"phone","category_id":"%s","attributes":{"brand":"Acme","model":"X1"}}',
    '[{"sku":"PH-1","price":100,"options":{"storage":"128 GB"}},{"sku":"PH-2","price":100,"options":{"storage":"128 GB"}}]')$q$,
    (select org from ids), (select phones from ids)),
  '23505', 'two variants cannot share identical options');

-- A valid phone with a Storage × Colour matrix, published to the shop
create temp table phone on commit drop as
  select public.create_product(
    (select org from ids),
    jsonb_build_object('title', 'Acme X1', 'slug', 'acme-x1', 'status', 'active', 'category_id', (select phones from ids),
                       'attributes', '{"brand":"Acme","model":"X1","warranty_months":12}'::jsonb),
    '[{"sku":"X1-128-BLK","title":"128 GB / Black","price":19999,"options":{"storage":"128 GB","colour":"Black"}},
      {"sku":"X1-256-BLK","title":"256 GB / Black","price":22999,"options":{"storage":"256 GB","colour":"Black"}}]'::jsonb,
    array[(select shop from ids)]
  ) as id;
grant all on phone to authenticated;

select pg_temp.assert((select tracking = 'serial' from public.products where id = (select id from phone)),
  'phones inherit serial tracking');
select pg_temp.assert((select count(*) = 2 from public.product_variants where product_id = (select id from phone)),
  'variants created');
select pg_temp.assert((select is_published from public.shop_products where product_id = (select id from phone)),
  'active product is published to the chosen shop');
select pg_temp.assert((select count(*) = 1 from public.audit_logs where action = 'product.created'), 'product creation audited');

create temp table v on commit drop as select
  (select id from public.product_variants where sku = 'X1-128-BLK') as phone_variant;
grant all on v to authenticated;

-- ---------------------------------------------------------------------------
-- Serial-tracked stock
-- ---------------------------------------------------------------------------
select public.receive_stock((select phone_variant from v), (select wh1 from ids), null,
  array['imei-1001', ' IMEI-1002 ', 'IMEI-1003'], null, null, 'First shipment');

select pg_temp.assert((select on_hand = 3 from public.inventory_levels where variant_id = (select phone_variant from v)),
  'receiving 3 serials sets on_hand to 3');
select pg_temp.assert(
  (select array_agg(serial_number order by serial_number) = array['IMEI-1001', 'IMEI-1002', 'IMEI-1003']
     from public.inventory_serials where variant_id = (select phone_variant from v)),
  'serials are trimmed and upper-cased');
select pg_temp.assert(
  (select serial_numbers = array['IMEI-1001', 'IMEI-1002', 'IMEI-1003'] from public.stock_movements
    where variant_id = (select phone_variant from v) order by id limit 1),
  'ledger records which serials moved');

select pg_temp.expect_error(format($q$select public.receive_stock(%L, %L, null, array['IMEI-1002'])$q$,
  (select phone_variant from v), (select wh1 from ids)), '23505', 'a serial number can exist only once');
select pg_temp.expect_error(format($q$select public.receive_stock(%L, %L, null, array['IMEI-2001', 'imei-2001'])$q$,
  (select phone_variant from v), (select wh1 from ids)), '23514', 'duplicates inside one entry are rejected');
select pg_temp.expect_error(format($q$select public.adjust_stock(%L, %L, 5, 'receipt')$q$,
  (select phone_variant from v), (select wh1 from ids)), '23514', 'plain adjustments are refused for serial-tracked items');

select public.remove_stock((select phone_variant from v), (select wh1 from ids), 'damage', null, array['IMEI-1003'], null, 'Screen cracked');
select pg_temp.assert((select on_hand = 2 from public.inventory_levels where variant_id = (select phone_variant from v)),
  'removing a damaged unit decrements stock');
select pg_temp.assert((select status = 'damaged' from public.inventory_serials where serial_number = 'IMEI-1003'),
  'damaged serial is marked damaged');
select pg_temp.expect_error(format($q$select public.remove_stock(%L, %L, 'damage', null, array['IMEI-1003'])$q$,
  (select phone_variant from v), (select wh1 from ids)), '23514', 'a unit cannot be removed twice');

select public.transfer_stock((select phone_variant from v), (select wh1 from ids), (select wh2 from ids), null, array['IMEI-1001']);
select pg_temp.assert(
  (select array_agg(on_hand order by warehouse_id = (select wh1 from ids)) = array[1, 1]
     from public.inventory_levels where variant_id = (select phone_variant from v)),
  'serial transfer moves one unit between warehouses');
select pg_temp.assert((select warehouse_id = (select wh2 from ids) from public.inventory_serials where serial_number = 'IMEI-1001'),
  'transferred serial now lives in the destination');
select pg_temp.assert(
  (select count(distinct reference_id) = 1 and count(*) = 2 from public.stock_movements
    where reference_type = 'transfer' and variant_id = (select phone_variant from v)),
  'transfer writes a linked out/in pair in the ledger');

-- ---------------------------------------------------------------------------
-- Batch-tracked stock (FEFO)
-- ---------------------------------------------------------------------------
create temp table food on commit drop as
  select public.create_product(
    (select org from ids),
    jsonb_build_object('title', 'Masala Oats', 'slug', 'masala-oats', 'category_id', (select food from ids),
                       'attributes', '{"diet":"Veg","shelf_life_days":180}'::jsonb),
    '[{"sku":"OATS-500","title":"500 g","price":199,"options":{"net_weight":500}}]'::jsonb
  ) as id;
grant all on food to authenticated;
alter table v add column oats uuid;
update v set oats = (select id from public.product_variants where sku = 'OATS-500');

select pg_temp.expect_error(format($q$select public.receive_stock(%L, %L, 10)$q$, (select oats from v), (select wh1 from ids)),
  '23514', 'batch code is required for batch-tracked items');

select public.receive_stock((select oats from v), (select wh1 from ids), 10, null, 'b-jan', '2027-01-31');
select public.receive_stock((select oats from v), (select wh1 from ids), 5, null, 'B-DEC', '2026-12-15');
select public.receive_stock((select oats from v), (select wh1 from ids), 5, null, 'B-JAN');

select pg_temp.assert((select on_hand = 20 from public.inventory_levels where variant_id = (select oats from v)),
  'batch receipts add up');
select pg_temp.assert(
  (select on_hand = 15 and expiry_date = '2027-01-31' from public.inventory_batches where batch_code = 'B-JAN'),
  'receiving into an existing batch tops it up and keeps its expiry');
select pg_temp.assert(
  (select next_expiry = '2026-12-15' from public.inventory_overview where variant_id = (select oats from v)),
  'overview shows the earliest expiry (FEFO)');

select public.remove_stock((select oats from v), (select wh1 from ids), 'damage', 3, null,
  (select id from public.inventory_batches where batch_code = 'B-JAN' and warehouse_id = (select wh1 from ids)));
select pg_temp.assert((select on_hand = 12 from public.inventory_batches where batch_code = 'B-JAN'), 'batch decremented');
select pg_temp.expect_error(format($q$select public.remove_stock(%L, %L, 'damage', 99, null, %L)$q$,
  (select oats from v), (select wh1 from ids),
  (select id from public.inventory_batches where batch_code = 'B-JAN')), '23514', 'cannot remove more than a batch holds');

select public.transfer_stock((select oats from v), (select wh1 from ids), (select wh2 from ids), 4, null,
  (select id from public.inventory_batches where batch_code = 'B-JAN' and warehouse_id = (select wh1 from ids)));
select pg_temp.assert(
  (select on_hand = 4 and expiry_date = '2027-01-31' from public.inventory_batches
    where batch_code = 'B-JAN' and warehouse_id = (select wh2 from ids)),
  'batch transfer recreates the lot (with expiry) at the destination');
select pg_temp.assert(
  (select sum(on_hand) = 17 from public.inventory_levels where variant_id = (select oats from v)),
  'total stock is unchanged by a transfer');
select pg_temp.assert(
  (select sum(b.on_hand) = sum(distinct l.on_hand) from public.inventory_batches b
     join public.inventory_levels l on l.variant_id = b.variant_id and l.warehouse_id = b.warehouse_id
    where b.variant_id = (select oats from v) and b.warehouse_id = (select wh2 from ids)),
  'batch quantities reconcile with the level at each warehouse');

-- Quantity-tracked items still use plain amounts
create temp table tee on commit drop as
  select public.create_product((select org from ids),
    jsonb_build_object('title', 'Tee', 'slug', 'tee', 'category_id', (select clothing from ids)),
    '[{"sku":"TEE-M","title":"M / White","price":499,"options":{"size":"M","colour":"White"}}]'::jsonb) as id;
select public.receive_stock((select id from public.product_variants where sku = 'TEE-M'), (select wh1 from ids), 30);
select public.adjust_stock((select id from public.product_variants where sku = 'TEE-M'), (select wh1 from ids), -2, 'adjustment');
select pg_temp.assert(
  (select on_hand = 28 from public.inventory_levels where variant_id = (select id from public.product_variants where sku = 'TEE-M')),
  'quantity tracking works through receive and adjust');

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select variant_count = 2 and on_hand = 2 and min_price = 19999 and max_price = 22999
     from public.product_overview where id = (select id from phone)),
  'product overview aggregates variants, prices and stock');

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
select pg_temp.expect_error(format($q$insert into public.inventory_serials (organization_id, variant_id, warehouse_id, serial_number)
  values (%L, %L, %L, 'HACK-1')$q$, (select org from ids), (select phone_variant from v), (select wh1 from ids)),
  '42501', 'serial rows cannot be written directly');

reset role;
insert into public.organization_members (organization_id, user_id, role)
select org, '00000000-0000-0000-0000-0000000000c1', 'support' from ids;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect_error(format($q$select public.receive_stock(%L, %L, 1, null, 'B-X')$q$, (select oats from v), (select wh1 from ids)),
  '42501', 'support role cannot change stock');
select pg_temp.assert((select count(*) > 0 from public.inventory_overview), 'support can still view stock');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select pg_temp.expect_error(format($q$select public.receive_stock(%L, %L, 1, null, 'B-X')$q$, (select oats from v), (select wh1 from ids)),
  '42501', 'another tenant cannot change stock');
select pg_temp.assert((select count(*) = 0 from public.inventory_overview), 'another tenant sees no stock');
select pg_temp.assert((select count(*) = 0 from public.product_overview), 'another tenant sees no products');
select pg_temp.expect_error(format($q$select public.create_product(%L, '{"title":"X","slug":"x"}', '[{"sku":"XX-1","price":1}]')$q$,
  (select org from ids)), '42501', 'another tenant cannot create products');

-- ---------------------------------------------------------------------------
-- Category and field guards
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error(format($q$update public.categories set tracking = 'quantity' where id = %L$q$, (select phones from ids)),
  '23514', 'tracking mode is locked once a category has products');

select pg_temp.expect_error(format($q$delete from public.attribute_definitions where category_id = %L and key = 'storage'$q$,
  (select phones from ids)), '23514', 'a variant option in use cannot be deleted');

delete from public.attribute_definitions where category_id = (select phones from ids) and key = 'warranty_months';
select pg_temp.assert(
  (select not (attributes ? 'warranty_months') from public.products where id = (select id from phone)),
  'deleting a product detail field strips its values');

-- ---------------------------------------------------------------------------
-- update_product, set_warehouse_shops, warehouse_overview
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');

-- Keep the 128 GB variant (new price), drop the 256 GB one, add a 512 GB one, unpublish.
select public.update_product(
  (select id from phone),
  jsonb_build_object('title', 'Acme X1 (2026)', 'slug', 'acme-x1', 'status', 'draft',
                     'attributes', '{"brand":"Acme","model":"X1"}'::jsonb),
  jsonb_build_array(
    jsonb_build_object('id', (select phone_variant from v), 'sku', 'X1-128-BLK', 'price', 18999,
                       'title', '128 GB / Black'),
    jsonb_build_object('sku', 'X1-512-BLK', 'title', '512 GB / Black', 'price', 27999,
                       'options', '{"storage":"512 GB","colour":"Black"}'::jsonb)
  ),
  '{}'::uuid[]
);
select pg_temp.assert((select title = 'Acme X1 (2026)' from public.products where id = (select id from phone)), 'product renamed');
select pg_temp.assert(
  (select array_agg(sku order by sku) = array['X1-128-BLK', 'X1-512-BLK'] from public.product_variants
    where product_id = (select id from phone) and is_active),
  'variants kept, added and deactivated as listed');
select pg_temp.assert((select price = 18999 from public.product_variants where sku = 'X1-128-BLK'), 'price updated');
select pg_temp.assert((select count(*) = 0 from public.shop_products where product_id = (select id from phone)),
  'unselected shops are unpublished');

-- Re-adding a previously removed combination works (inactive rows don't block it)
select public.update_product(
  (select id from phone),
  jsonb_build_object('title', 'Acme X1 (2026)', 'slug', 'acme-x1', 'status', 'active',
                     'attributes', '{"brand":"Acme","model":"X1"}'::jsonb),
  jsonb_build_array(
    jsonb_build_object('id', (select phone_variant from v), 'sku', 'X1-128-BLK', 'price', 18999),
    jsonb_build_object('id', (select id from public.product_variants where sku = 'X1-512-BLK'), 'sku', 'X1-512-BLK', 'price', 27999),
    jsonb_build_object('sku', 'X1-256-BLK-2', 'price', 22999, 'options', '{"storage":"256 GB","colour":"Black"}'::jsonb)
  ),
  array[(select shop from ids)]
);
select pg_temp.assert((select count(*) = 3 from public.product_variants where product_id = (select id from phone) and is_active),
  're-adding a removed combination creates a fresh active variant');
select pg_temp.assert((select is_published from public.shop_products where product_id = (select id from phone)),
  'activating republishes to selected shops');

select pg_temp.expect_error(format($q$select public.update_product(%L, '{"title":"X","slug":"acme-x1","attributes":{}}',
  '[{"sku":"X1-128-BLK","price":1}]')$q$, (select id from phone)), '23514', 'required details are re-validated on update');

-- Warehouse routing and overview
select public.set_warehouse_shops((select wh2 from ids), array[(select shop from ids)]);
select pg_temp.assert(
  (select priority = 2 from public.shop_warehouses where warehouse_id = (select wh2 from ids)),
  'a newly linked warehouse becomes the next priority for the shop');
select public.set_warehouse_shops((select wh2 from ids), '{}'::uuid[]);
select pg_temp.assert((select count(*) = 0 from public.shop_warehouses where warehouse_id = (select wh2 from ids)),
  'routing can be cleared');
select pg_temp.assert(
  (select units_on_hand > 0 and skus_in_stock = 3 from public.warehouse_overview where id = (select wh1 from ids)),
  'warehouse overview summarises stock');

update public.warehouses set is_active = false where id = (select wh2 from ids);
select pg_temp.expect_error(format($q$select public.receive_stock(%L, %L, 1)$q$,
  (select id from public.product_variants where sku = 'TEE-M'), (select wh2 from ids)), '23514', 'inactive warehouses take in no new stock');
update public.warehouses set is_active = true where id = (select wh2 from ids);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select pg_temp.expect_error(format($q$select public.set_warehouse_shops(%L, '{}')$q$, (select wh1 from ids)),
  '42501', 'another tenant cannot change routing');
select pg_temp.expect_error(format($q$select public.update_product(%L, '{"title":"X","slug":"x"}', '[{"sku":"Z-1","price":1}]')$q$,
  (select id from phone)), '42501', 'another tenant cannot edit products');

-- ---------------------------------------------------------------------------
-- Category / field editing guards
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');

select pg_temp.expect_error(format($q$update public.attribute_definitions set type = 'text'
  where category_id = %L and key = 'storage'$q$, (select phones from ids)), '23514', 'field type is fixed');
select pg_temp.expect_error(format($q$update public.attribute_definitions set options = array_remove(options, '128 GB')
  where category_id = %L and key = 'storage'$q$, (select phones from ids)), '23514', 'cannot drop a variant option value in use');

update public.attribute_definitions set options = options || array['1 TB'], label = 'Storage size'
  where category_id = (select phones from ids) and key = 'storage';
select pg_temp.assert((select '1 TB' = any (options) and label = 'Storage size' from public.attribute_definitions
  where category_id = (select phones from ids) and key = 'storage'), 'options can be added and labels renamed');
update public.attribute_definitions set options = array_remove(options, '1 TB')
  where category_id = (select phones from ids) and key = 'storage';
select pg_temp.assert(true, 'unused option values can be removed');

select pg_temp.expect_error(format($q$delete from public.categories where id = %L$q$, (select phones from ids)),
  '23514', 'a category with products cannot be deleted');
select pg_temp.expect_error(format($q$delete from public.categories where id = (select parent_id from public.categories where id = %L)$q$,
  (select phones from ids)), '23514', 'nor can its parent');

insert into public.categories (organization_id, parent_id, name, slug, tracking)
  select org, (select parent_id from public.categories where id = (select phones from ids)), 'Drones', 'drones', 'serial' from ids;
delete from public.categories where slug = 'drones' and organization_id = (select org from ids);
select pg_temp.assert(not exists (select 1 from public.categories where slug = 'drones'), 'an empty category can be deleted');

select 'ALL PRODUCT & INVENTORY TESTS PASSED' as result;
rollback;
