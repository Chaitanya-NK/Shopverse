-- Catalogue and stock for the end-to-end business, created by the setup
-- project after onboarding through the UI. Safe to run again: products are
-- only created once, and stock is topped up when a run has used it.
--   psql -v owner_email=owner@e2e-threads.test -f e2e/seed.sql
select set_config('request.jwt.claims', json_build_object('role', 'authenticated',
  'sub', (select id from auth.users where email = :'owner_email'))::text, false);
set role authenticated;

with o as (select id from public.organizations where slug = 'e2e-threads')
select public.create_product(o.id,
  jsonb_build_object('title', 'Classic cotton tee', 'slug', 'classic-tee', 'status', 'active',
    'description', 'Soft 180 GSM combed cotton with a relaxed fit.',
    'category_id', (select id from public.categories where slug = 'clothing' and organization_id = o.id),
    'attributes', '{}'::jsonb),
  '[{"sku":"E2E-TEE-M","title":"M","price":499,"options":{"size":"M"}},
    {"sku":"E2E-TEE-L","title":"L","price":499,"options":{"size":"L"}}]'::jsonb)
from o where not exists (select 1 from public.products p where p.organization_id = o.id and p.slug = 'classic-tee');

with o as (select id from public.organizations where slug = 'e2e-threads')
select public.create_product(o.id,
  jsonb_build_object('title', 'Rolled oats 1 kg', 'slug', 'rolled-oats', 'status', 'active',
    'category_id', (select id from public.categories where slug = 'packaged-food' and organization_id = o.id),
    'attributes', '{"diet":"Vegan"}'::jsonb),
  '[{"sku":"E2E-OATS","price":249}]'::jsonb)
from o where not exists (select 1 from public.products p where p.organization_id = o.id and p.slug = 'rolled-oats');

update public.categories set gst_rate = 5
where slug = 'clothing' and organization_id = (select id from public.organizations where slug = 'e2e-threads');

-- Top up stock in the first warehouse.
select public.receive_stock(v.id, w.id, (20 - coalesce(s.on_hand, 0))::int)
from public.product_variants v
join public.products p on p.id = v.product_id
join public.organizations o on o.id = p.organization_id and o.slug = 'e2e-threads'
cross join lateral (select id from public.warehouses where organization_id = o.id order by created_at limit 1) w
left join lateral (select sum(on_hand) as on_hand from public.inventory_overview i
                   where i.sku = v.sku and i.warehouse_id = w.id) s on true
where v.sku in ('E2E-TEE-M', 'E2E-TEE-L') and coalesce(s.on_hand, 0) < 10;

select public.receive_stock(v.id, w.id, 20, null, 'B-E2E', current_date + 60)
from public.product_variants v
join public.products p on p.id = v.product_id
join public.organizations o on o.id = p.organization_id and o.slug = 'e2e-threads'
cross join lateral (select id from public.warehouses where organization_id = o.id order by created_at limit 1) w
left join lateral (select sum(on_hand) as on_hand from public.inventory_overview i
                   where i.sku = v.sku and i.warehouse_id = w.id) s on true
where v.sku = 'E2E-OATS' and coalesce(s.on_hand, 0) < 10;
reset role;

update public.products set hsn_code = '6109'
where slug = 'classic-tee' and organization_id = (select id from public.organizations where slug = 'e2e-threads');
update public.categories set returnable = false
where slug = 'packaged-food' and organization_id = (select id from public.organizations where slug = 'e2e-threads');

-- Open the shop and publish everything.
update public.shops set status = 'live',
  settings = settings || '{"shipping_fee":49,"free_shipping_over":999,"cod_limit":25000,"support_email":"help@e2e-threads.test",
    "gstin":"29ABCDE1234F1Z5","legal_name":"E2E Threads Pvt Ltd",
    "business_address":{"line1":"12 Residency Rd","city":"Bengaluru","state":"Karnataka","postal_code":"560025"}}'
where slug = 'e2e-threads';
insert into public.shop_products (organization_id, shop_id, product_id, is_published, published_at)
select p.organization_id, s.id, p.id, true, now()
from public.products p join public.shops s on s.slug = 'e2e-threads' and s.organization_id = p.organization_id
on conflict do nothing;

-- The owner is also a Shopverse platform admin, for the /admin pages.
insert into private.platform_admins (user_id)
select id from auth.users where email = :'owner_email'
on conflict do nothing;
