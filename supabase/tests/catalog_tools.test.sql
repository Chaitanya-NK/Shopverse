-- =============================================================================
-- Catalogue tools: variant photos, collections, reviews, related products, search.
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

-- Order A: 3 tees and oats (with a 200 discount) and oats, COD with delivery 49; shipped and delivered.
create temp table addr on commit drop as select
  '{"name":"Asha Rao","phone":"+919800000001","line1":"12 MG Road","city":"Pune","state":"Maharashtra","postal_code":"411001"}'::jsonb as a;
create temp table oa on commit drop as select public.create_order((select shop from ids), '{"email":"asha@example.com","full_name":"Asha"}',
  (select a from addr), jsonb_build_array(
    jsonb_build_object('variant_id', (select m from v), 'quantity', 3),
    jsonb_build_object('variant_id', (select oats from v), 'quantity', 1)), 'cod', 'pending', 49, 200) as id;
grant select on oa to authenticated, service_role;
create temp table li on commit drop as select
  (select id from public.order_items where order_id = (select id from oa) and sku = 'TEE-M') as tee,
  (select id from public.order_items where order_id = (select id from oa) and sku = 'OATS') as oats;
grant select on li to authenticated, service_role;

select pg_temp.assert(
  (public.order_return_options((select id from oa)) -> 'items' -> 0 ->> 'blocked') = 'not_delivered',
  'nothing can be returned before delivery');

create temp table sa on commit drop as select public.create_shipment((select id from oa), (select wh from ids),
  jsonb_build_array(jsonb_build_object('order_item_id', (select tee from li), 'quantity', 3),
                    jsonb_build_object('order_item_id', (select oats from li), 'quantity', 1))) as id;
select public.update_shipment_status((select id from sa), 'picked_up');
create temp table otp on commit drop as select public.update_shipment_status((select id from sa), 'out_for_delivery') as code;
select public.confirm_delivery((select id from sa), (select code from otp));
grant select on sa to authenticated, service_role;

select pg_temp.assert((select status = 'completed' and payment_status = 'paid' and invoice_number is not null
                       from public.orders where id = (select id from oa)), 'delivered, paid by cash, invoiced');


-- ---------------------------------------------------------------------------
-- Photos per variant
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
create temp table img on commit drop as select gen_random_uuid() as id;
grant select on img to authenticated;
insert into public.product_images (id, organization_id, product_id, width, height, variant_id)
values ((select id from img), (select org from ids), (select product_id from public.product_variants where sku = 'TEE-M'), 100, 100,
        (select l from v));
select pg_temp.expect_error(format($q$update public.product_images set variant_id = %L where id = %L$q$, (select oats from v), (select id from img)),
  '23514', 'a photo can only belong to an option of its own product');
select pg_temp.act_as(null);
select pg_temp.assert(
  (public.storefront_product((select shop from ids), 'tee') -> 'images' -> 0 ->> 'variant_id')::uuid = (select l from v),
  'the storefront knows which option a photo shows');

-- ---------------------------------------------------------------------------
-- Collections
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_error(format($q$insert into public.collections (organization_id, shop_id, title, slug) values (%L, %L, 'Sale', 'sale')$q$,
  (select org from ids), (select shop from ids)), '42501', 'staff cannot create collections');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
insert into public.collections (organization_id, shop_id, title, slug, featured) values ((select org from ids), (select shop from ids), 'Monsoon picks', 'monsoon', true);
create temp table col on commit drop as select id from public.collections where slug = 'monsoon';
grant select on col to authenticated, anon;
insert into public.collection_products (organization_id, collection_id, product_id, position)
select (select org from ids), (select id from col), p.id, 0 from public.products p where p.slug in ('tee', 'oats');
select public.reorder_collection((select id from col), array[(select id from public.products where slug = 'oats'), (select id from public.products where slug = 'tee')]);
select pg_temp.act_as(null);
select pg_temp.assert(
  (select jsonb_array_length(j) = 1 and j -> 0 ->> 'slug' = 'monsoon' from (select public.storefront_collections((select shop from ids)) as j) x),
  'shoppers see the collection');
select pg_temp.assert(
  (select (j ->> 'total')::int = 2 and j -> 'items' -> 0 ->> 'slug' = 'oats'
   from (select public.storefront_catalog((select shop from ids), p_sort => 'featured', p_collection_id => (select id from col)) as j) x),
  'collection pages list its products in the chosen order');

-- ---------------------------------------------------------------------------
-- Search: typos and SKUs
-- ---------------------------------------------------------------------------
select pg_temp.assert((public.storefront_catalog((select shop from ids), null, 'tea') ->> 'total')::int >= 0, 'search runs');
select pg_temp.assert(
  (public.storefront_catalog((select shop from ids), null, 'oatz') -> 'items' -> 0 ->> 'slug') = 'oats',
  'a typo still finds the product');
select pg_temp.assert(
  (public.storefront_catalog((select shop from ids), null, 'tee-l') -> 'items' -> 0 ->> 'slug') = 'tee',
  'an exact SKU finds its product');
select pg_temp.assert((public.storefront_catalog((select shop from ids), null, 'xylophone') ->> 'total')::int = 0,
  'unrelated words find nothing');

-- ---------------------------------------------------------------------------
-- Reviews: verified buyers only
-- ---------------------------------------------------------------------------
select pg_temp.as_server();
create temp table si on commit drop as select public.shopper_sign_in_start((select shop from ids), 'asha@example.com') as j;
create temp table sess on commit drop as
  select public.shopper_sign_in_verify((select (j ->> 'sign_in_id')::uuid from si), (select j ->> 'otp' from si)) ->> 'token' as tok;
create temp table si2 on commit drop as select public.shopper_sign_in_start((select shop from ids), 'bob@example.com') as j;
create temp table sess2 on commit drop as
  select public.shopper_sign_in_verify((select (j ->> 'sign_in_id')::uuid from si2), (select j ->> 'otp' from si2)) ->> 'token' as tok;
create temp table pr on commit drop as select (select id from public.products where slug = 'tee') as tee;
grant select on pr, sess, sess2 to anon, authenticated;

select pg_temp.assert((public.shopper_review_status((select shop from ids), (select tok from sess), (select tee from pr)) ->> 'eligible')::boolean,
  'a customer who received it can review');
select pg_temp.assert((public.shopper_review_status((select shop from ids), (select tok from sess2), (select tee from pr)) ->> 'eligible')::boolean = false,
  'others cannot');
select pg_temp.expect_error(format($q$select public.shopper_save_review(%L, %L, %L, 5, 'Nice', null)$q$,
  (select shop from ids), (select tok from sess2), (select tee from pr)), '42501', 'non-buyers are refused');
select pg_temp.expect_error(format($q$select public.shopper_save_review(%L, %L, %L, 6, null, null)$q$,
  (select shop from ids), (select tok from sess), (select tee from pr)), '23514', 'stars from 1 to 5');
select public.shopper_save_review((select shop from ids), (select tok from sess), (select tee from pr), 4, 'Comfy', 'Soft fabric');
select public.shopper_save_review((select shop from ids), (select tok from sess), (select tee from pr), 5, 'Comfy', 'Soft fabric, true to size');
select pg_temp.act_as(null);
select pg_temp.expect_error(format($q$select public.shopper_save_review(%L, 'x', %L, 5, null, null)$q$, (select shop from ids), (select tee from pr)),
  '42501', 'the public cannot write reviews directly');
create temp table rv on commit drop as select public.storefront_reviews((select shop from ids), (select tee from pr)) as j;
select pg_temp.assert(
  (select (j ->> 'count')::int = 1 and (j ->> 'average')::numeric = 5 and (j -> 'distribution' ->> '5')::int = 1
          and j -> 'items' -> 0 ->> 'author' = 'Asha' and j -> 'items' -> 0 ->> 'body' = 'Soft fabric, true to size' from rv),
  'one review per customer (edited), with a short author name');
select pg_temp.assert(
  (select (i -> 'rating' ->> 'count')::int = 1 from jsonb_array_elements(public.storefront_catalog((select shop from ids)) -> 'items') i
   where i ->> 'slug' = 'tee'),
  'catalog cards carry the rating');

-- Staff hide and reply; staff (not support) can't.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_error(format($q$select public.moderate_review(%L, 'hidden')$q$, (select id from public.product_reviews limit 1)),
  '42501', 'staff cannot moderate');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select public.moderate_review((select id from public.product_reviews limit 1), 'published', 'Thank you, Asha!');
select pg_temp.assert((select reply = 'Thank you, Asha!' from public.review_overview), 'reply saved');
select public.moderate_review((select id from public.product_reviews limit 1), 'hidden');
select pg_temp.act_as(null);
select pg_temp.assert((public.storefront_reviews((select shop from ids), (select tee from pr)) ->> 'count')::int = 0,
  'hidden reviews disappear from the shop');

-- ---------------------------------------------------------------------------
-- Related products
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select j -> 0 ->> 'slug' = 'oats' from (select public.storefront_related((select shop from ids), (select tee from pr)) as j) x),
  'related through a shared collection');

\echo ALL CATALOGUE TOOL TESTS PASSED
rollback;
