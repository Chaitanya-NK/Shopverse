-- =============================================================================
-- Storefront design: drafts, publishing, safety checks, catalogue sections, newsletter.
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

reset role;
create temp table addr on commit drop as select
  '{"name":"Asha Rao","phone":"+919800000001","line1":"12 MG Road","city":"Pune","state":"Maharashtra","postal_code":"411001"}'::jsonb as a;
grant select on addr to service_role, authenticated, anon;

create temp table pfx on commit drop as
  select (select org from ids)::text || '/shops/' || (select shop from ids)::text || '/' as p;
grant select on pfx to authenticated, anon;

create function pg_temp.design(p_extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object(
    'version', 1,
    'style', '{"headingFont":"fraunces"}'::jsonb,
    'templates', jsonb_build_object(
      'home', jsonb_build_object('sections', jsonb_build_array(
        jsonb_build_object('id', 'h1', 'type', 'hero', 'settings', jsonb_build_object(
          'heading', 'Hello', 'link', '/c/sale', 'image', jsonb_build_object('path', (select p from pfx) || '00000000-0000-0000-0000-00000000aaaa', 'width', 10, 'height', 5)))))),
    'pages', '[]'::jsonb) || p_extra;
$$;
grant execute on function pg_temp.design(jsonb) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Who may design
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_error(format($q$select public.save_design_draft(%L, pg_temp.design(), 0)$q$, (select shop from ids)),
  '42501', 'staff cannot change the design');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select pg_temp.expect_error(format($q$select public.save_design_draft(%L, pg_temp.design(), 0)$q$, (select shop from ids)),
  '42501', 'outsiders cannot change the design');
select pg_temp.act_as(null);
select pg_temp.expect_error(format($q$select public.save_design_draft(%L, pg_temp.design(), 0)$q$, (select shop from ids)),
  '42501', 'the public cannot call it');

-- ---------------------------------------------------------------------------
-- Safety checks
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error(format($q$select public.save_design_draft(%L, pg_temp.design(%L), 0)$q$, (select shop from ids),
  jsonb_build_object('templates', jsonb_build_object('home', jsonb_build_object('sections', jsonb_build_array(
    jsonb_build_object('id', 'x', 'type', 'gallery', 'settings', jsonb_build_object('images', jsonb_build_array(
      jsonb_build_object('image', jsonb_build_object('path', '11111111-1111-1111-1111-111111111111/shops/11111111-1111-1111-1111-111111111111/11111111-1111-1111-1111-111111111111')))))))))),
  '23514', 'images must be this shop''s uploads, however deeply nested');
select pg_temp.expect_error(format($q$select public.save_design_draft(%L, pg_temp.design(%L), 0)$q$, (select shop from ids),
  jsonb_build_object('templates', jsonb_build_object('home', jsonb_build_object('sections', jsonb_build_array(
    jsonb_build_object('id', 'x', 'type', 'rich-text', 'settings', jsonb_build_object('link', 'javascript:alert(1)'))))))),
  '23514', 'no script links');
select pg_temp.expect_error(format($q$select public.save_design_draft(%L, pg_temp.design(%L), 0)$q$, (select shop from ids),
  jsonb_build_object('templates', jsonb_build_object('home', jsonb_build_object('sections', jsonb_build_array(
    jsonb_build_object('id', 'x', 'type', 'rich-text', 'settings', jsonb_build_object('link', '//evil.example'))))))),
  '23514', 'no protocol-relative links');
select pg_temp.expect_error(format($q$select public.save_design_draft(%L, pg_temp.design(%L), 0)$q$, (select shop from ids),
  jsonb_build_object('templates', jsonb_build_object('home', jsonb_build_object('sections', jsonb_build_array(
    jsonb_build_object('id', 'x', 'type', 'video', 'settings', jsonb_build_object('video', 'https://evil.example/v'))))))),
  '23514', 'videos from YouTube or Vimeo only');
select pg_temp.expect_error(format($q$select public.save_design_draft(%L, pg_temp.design(%L), 0)$q$, (select shop from ids),
  jsonb_build_object('templates', jsonb_build_object('home', jsonb_build_object('sections',
    (select jsonb_agg(jsonb_build_object('id', g::text, 'type', 'rich-text', 'settings', '{}'::jsonb)) from generate_series(1, 31) g))))),
  '23514', 'at most 30 sections a page');
select pg_temp.expect_error(format($q$select public.save_design_draft(%L, pg_temp.design(%L), 0)$q$, (select shop from ids),
  jsonb_build_object('templates', jsonb_build_object('checkout', jsonb_build_object('sections', '[]'::jsonb)))),
  '23514', 'only known templates');
select pg_temp.expect_error(format($q$select public.save_design_draft(%L, pg_temp.design(%L), 0)$q$, (select shop from ids),
  jsonb_build_object('pages', '[{"id":"a","handle":"shipping","title":"S","sections":[]}]'::jsonb)),
  '23514', 'custom pages cannot take a policy page''s address');
select pg_temp.expect_error(format($q$select public.save_design_draft(%L, pg_temp.design(%L), 0)$q$, (select shop from ids),
  jsonb_build_object('pages', '[{"id":"a","handle":"about","title":"A","sections":[]},{"id":"b","handle":"about","title":"B","sections":[]}]'::jsonb)),
  '23514', 'page addresses are unique');
select pg_temp.expect_error(format($q$select public.save_design_draft(%L, pg_temp.design(%L), 0)$q$, (select shop from ids),
  jsonb_build_object('pages', '[{"id":"a","handle":"About Us","title":"A","sections":[]}]'::jsonb)),
  '23514', 'page addresses are slugs');
select pg_temp.expect_error(format($q$select public.save_design_draft(%L, pg_temp.design(%L), 0)$q$, (select shop from ids),
  jsonb_build_object('blob', repeat('x', 270000))), '23514', 'size is bounded');

-- ---------------------------------------------------------------------------
-- Draft, versions, publish, discard
-- ---------------------------------------------------------------------------
select pg_temp.assert(public.save_design_draft((select shop from ids),
  pg_temp.design('{"pages":[{"id":"a","handle":"about","title":"About","sections":[]}]}'), 0) = 1, 'first save is version 1');
select pg_temp.expect_error(format($q$select public.save_design_draft(%L, pg_temp.design(), 0)$q$, (select shop from ids)),
  '23505', 'a stale editor cannot overwrite a newer save');
select pg_temp.assert(public.save_design_draft((select shop from ids), pg_temp.design('{"pages":[{"id":"a","handle":"about","title":"About","sections":[]}]}'), 1) = 2,
  'saves move the version on');

-- Shoppers see nothing until it's published; staff preview sees the draft.
select pg_temp.act_as(null);
select pg_temp.assert(public.storefront_design((select shop from ids)) is null, 'nothing published yet');
select pg_temp.assert(public.storefront_design((select shop from ids), true) is null, 'the public cannot preview drafts');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.assert(public.storefront_design((select shop from ids), true) -> 'style' ->> 'headingFont' = 'fraunces',
  'shop staff can preview the draft');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert(public.storefront_design((select shop from ids), true) is null, 'other businesses cannot preview it');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_error(format($q$select public.publish_design(%L, 2)$q$, (select shop from ids)), '42501', 'staff cannot publish');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error(format($q$select public.publish_design(%L, 1)$q$, (select shop from ids)), '23505', 'publishing checks the version');
select pg_temp.assert(public.publish_design((select shop from ids), 2) = 3, 'published');
select pg_temp.expect_error(format($q$select public.publish_design(%L, 3)$q$, (select shop from ids)), '23514', 'nothing left to publish');
reset role;
select pg_temp.assert((select draft is null and published -> 'pages' -> 0 ->> 'handle' = 'about' and published_by is not null
                       from public.shop_designs where shop_id = (select shop from ids)), 'the draft became the live design');
select pg_temp.assert((select count(*) = 1 from public.audit_logs where action = 'shop.design_published'), 'publishing is audited');
select pg_temp.act_as(null);
select pg_temp.assert(public.storefront_design((select shop from ids)) -> 'pages' -> 0 ->> 'handle' = 'about', 'shoppers see the published design');

-- A new draft, then discard it.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select public.save_design_draft((select shop from ids), pg_temp.design('{"style":{"headingFont":"lora"}}'), 3);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.assert(public.storefront_design((select shop from ids), true) -> 'style' ->> 'headingFont' = 'lora', 'preview shows the new draft');
select pg_temp.act_as(null);
select pg_temp.assert(public.storefront_design((select shop from ids), true) -> 'style' ->> 'headingFont' = 'fraunces', 'shoppers keep the live one');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert(public.discard_design_draft((select shop from ids), 4) = 5, 'discarded');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.assert(public.storefront_design((select shop from ids), true) -> 'style' ->> 'headingFont' = 'fraunces',
  'preview falls back to the live design');
select pg_temp.assert((select count(*) = 1 from public.shop_designs), 'staff can read their shop''s design');
select pg_temp.expect_error($q$update public.shop_designs set draft = '{}'$q$, '42501', 'no direct writes');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert((select count(*) = 0 from public.shop_designs), 'other businesses cannot read it');

-- Draft shops: the design is hidden with the shop.
reset role;
update public.shops set status = 'draft' where id = (select shop from ids);
select pg_temp.act_as(null);
select pg_temp.assert(public.storefront_design((select shop from ids)) is null, 'a draft shop''s design is hidden');
reset role;
update public.shops set status = 'live' where id = (select shop from ids);

-- ---------------------------------------------------------------------------
-- Catalogue: on sale and best sellers
-- ---------------------------------------------------------------------------
reset role;
update public.product_variants set compare_at_price = 650 where sku = 'OATS';
select pg_temp.act_as(null);
select pg_temp.assert(
  (select (j ->> 'total')::int = 1 and j -> 'items' -> 0 ->> 'slug' = 'oats'
   from (select public.storefront_catalog((select shop from ids), p_on_sale => true) as j) x),
  'on-sale products only');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
create temp table oa on commit drop as select public.create_order((select shop from ids), '{"email":"asha@example.com","full_name":"Asha"}',
  (select a from addr), jsonb_build_array(jsonb_build_object('variant_id', (select m from v), 'quantity', 3)), 'cod', 'pending', 0, 0) as id;
reset role;
update public.orders set status = 'confirmed' where id = (select id from oa);
select pg_temp.act_as(null);
select pg_temp.assert(
  (public.storefront_catalog((select shop from ids), p_sort => 'bestselling') -> 'items' -> 0 ->> 'slug') = 'tee',
  'best sellers first');

-- ---------------------------------------------------------------------------
-- Shop reviews
-- ---------------------------------------------------------------------------
reset role;
insert into public.product_reviews (organization_id, shop_id, product_id, customer_id, rating, title, body)
select (select org from ids), (select shop from ids), p.id, c.id, r, 't' || r, b
from (values ('tee', 5, 'Lovely fabric'), ('oats', 5, '')) as x(slug, r, b)
join public.products p on p.slug = x.slug
cross join lateral (select id from public.customers where organization_id = (select org from ids) limit 1) c
on conflict do nothing;
select pg_temp.act_as(null);
select pg_temp.assert(
  (select jsonb_array_length(j) = 1 and j -> 0 ->> 'product_slug' = 'tee' and j -> 0 ->> 'body' = 'Lovely fabric'
     and j -> 0 ->> 'author' = 'Asha'
   from (select public.storefront_shop_reviews((select shop from ids), 4, 6) as j) x),
  'good reviews with words, with the product named');

-- ---------------------------------------------------------------------------
-- Newsletter
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null);
select public.newsletter_subscribe((select shop from ids), ' Riya@Example.com ');
select public.newsletter_subscribe((select shop from ids), 'riya@example.com');
select pg_temp.expect_error(format($q$select public.newsletter_subscribe(%L, 'not-an-email')$q$, (select shop from ids)),
  '23514', 'emails are checked');
select pg_temp.expect_error($q$select count(*) from public.newsletter_subscribers$q$, '42501', 'the public cannot read the list');
reset role;
select pg_temp.assert((select count(*) = 1 and min(email::text) = 'riya@example.com' from public.newsletter_subscribers),
  'one entry per address, stored lowercase');
insert into public.newsletter_subscribers (organization_id, shop_id, email, created_at)
select (select org from ids), (select shop from ids), 'flood' || g || '@example.com', now() from generate_series(1, 100) g;
select pg_temp.act_as(null);
select pg_temp.expect_error(format($q$select public.newsletter_subscribe(%L, 'late@example.com')$q$, (select shop from ids)),
  '23514', 'floods are throttled');
reset role;
delete from public.newsletter_subscribers where email::text like 'flood%';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.assert((select count(*) = 0 from public.newsletter_subscribers), 'staff cannot see the list');
select pg_temp.expect_error(format($q$select public.remove_newsletter_subscriber(%L)$q$,
  (select id from public.newsletter_subscribers limit 1)), 'P0002', 'staff cannot remove');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert((select count(*) = 1 from public.newsletter_subscribers), 'owners see the list');
select public.remove_newsletter_subscriber((select id from public.newsletter_subscribers limit 1));
select pg_temp.assert((select count(*) = 0 from public.newsletter_subscribers), 'and can remove people');

\echo ALL STOREFRONT DESIGN TESTS PASSED
rollback;
