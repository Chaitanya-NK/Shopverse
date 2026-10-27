-- =============================================================================
-- Product photos: RLS, limits, order, and what the storefront returns.
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
update public.shops set status = 'live' where id = (select shop from ids);
create temp table pr on commit drop as select
  (select id from public.products where slug = 'classic-tee' and organization_id = (select org from ids)) as tee;
grant select on pr to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Writing
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.assert(exists (select 1 from storage.buckets where id = 'product-images' and public), 'bucket exists and is public');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');

insert into public.product_images (id, organization_id, product_id, alt, width, height)
values ('10000000-0000-0000-0000-000000000001', (select org from ids), (select tee from pr), 'Front', 1600, 1600),
       ('10000000-0000-0000-0000-000000000002', (select org from ids), (select tee from pr), 'Back', 1600, 1200);
select pg_temp.assert(
  (select array_agg(sort_order order by id) = array[0, 1] from public.product_images), 'new photos go last');

select pg_temp.expect_error(format($q$insert into public.product_images (id, organization_id, product_id, width, height)
  select gen_random_uuid(), %L, %L, 10, 10 from generate_series(1, 11) g$q$, (select org from ids), (select tee from pr)),
  '23514', 'at most 12 photos per product');

select public.reorder_product_images((select tee from pr),
  array['10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001']::uuid[]);
select pg_temp.assert(
  (select sort_order from public.product_images where id = '10000000-0000-0000-0000-000000000002') = 1
  and (select sort_order from public.product_images where id = '10000000-0000-0000-0000-000000000001') = 2,
  'reordered');

select pg_temp.assert(
  (select cover_path from public.product_overview where id = (select tee from pr))
    = (select org from ids) || '/' || (select tee from pr) || '/10000000-0000-0000-0000-000000000002',
  'admin list shows the cover photo path');
select pg_temp.assert(
  exists (select 1 from public.audit_logs where entity_type = 'product_image' and action = 'product_image.created'),
  'adding photos is audited');

-- Other tenants can neither see nor add photos.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert((select count(*) from public.product_images) = 0, 'other tenants see no photos');
select pg_temp.expect_error(format($q$insert into public.product_images (id, organization_id, product_id, width, height)
  values (gen_random_uuid(), %L, %L, 10, 10)$q$, (select org from ids), (select tee from pr)),
  '42501', 'other tenants cannot add photos');
select public.reorder_product_images((select tee from pr),
  array['10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002']::uuid[]);
reset role;
select pg_temp.assert(
  (select sort_order from public.product_images where id = '10000000-0000-0000-0000-000000000002') = 1,
  'other tenants cannot reorder');

-- A photo can't be attached to a product of another organisation.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error(format($q$insert into public.product_images (id, organization_id, product_id, width, height)
  values (gen_random_uuid(), %L, gen_random_uuid(), 10, 10)$q$, (select org from ids)),
  '23503', 'the product must belong to the organisation');

-- ---------------------------------------------------------------------------
-- Storefront
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null);
select pg_temp.expect_error($q$select * from public.product_images$q$, '42501', 'the public cannot list the table');
select pg_temp.assert(
  (select (e -> 'image' ->> 'path') like '%/10000000-0000-0000-0000-000000000002' and (e -> 'image' ->> 'height')::int = 1200
   from jsonb_array_elements(public.storefront_catalog((select shop from ids)) -> 'items') e where e ->> 'slug' = 'classic-tee'),
  'catalogue cards carry the cover photo');
select pg_temp.assert(
  (select jsonb_array_length(public.storefront_product((select shop from ids), 'classic-tee') -> 'images') = 2
     and public.storefront_product((select shop from ids), 'classic-tee') -> 'images' -> 0 ->> 'alt' = 'Back'),
  'product page lists the gallery in order');
select pg_temp.assert(
  (select (e -> 'image') is not null from jsonb_array_elements(
     public.storefront_variants((select shop from ids), array[(select tee_m from v)])) e),
  'cart lines carry the cover photo');
select pg_temp.assert(
  (select e -> 'image' = 'null'::jsonb or (e -> 'image') is null
   from jsonb_array_elements(public.storefront_catalog((select shop from ids)) -> 'items') e where e ->> 'slug' = 'acme-x1'),
  'products without photos have no image');

select 'ALL PRODUCT PHOTO TESTS PASSED' as result;
rollback;
