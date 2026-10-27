-- =============================================================================
-- Shopverse · Migration 015 · Product photos
--
--  * Photos live in the public Storage bucket "product-images". The server
--    resizes every upload to WebP in two sizes (1600px and 480px) and stores
--    them at <organization_id>/<product_id>/<image_id>-{1600,480}.webp, so the
--    path is derived from ids and can never point into another tenant.
--  * public.product_images holds the order, alt text and dimensions. Managers
--    write it (RLS); at most 12 photos per product.
--  * Storefront functions now return a cover image (cards, cart) and the full
--    gallery (product page).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table public.product_images (
  -- Chosen by the server before uploading, so the file path is known up front.
  id              uuid primary key,
  organization_id uuid not null,
  product_id      uuid not null,
  alt             text check (alt is null or char_length(alt) <= 200),
  width           integer not null check (width between 1 and 10000),
  height          integer not null check (height between 1 and 10000),
  sort_order      integer not null default 0,
  created_by      uuid references auth.users (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  foreign key (organization_id, product_id) references public.products (organization_id, id) on delete cascade
);

create index product_images_product_idx on public.product_images (product_id, sort_order, created_at);

-- New photos go last; a product holds at most 12.
create or replace function private.product_images_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform 1 from public.products where id = new.product_id for update;
  select count(*), coalesce(max(sort_order), -1) + 1 into v_count, new.sort_order
  from public.product_images where product_id = new.product_id;
  if v_count >= 12 then
    raise exception 'A product can have up to 12 photos' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger product_images_before_insert
  before insert on public.product_images
  for each row execute function private.product_images_before_insert();

create trigger product_images_audit
  after insert or delete on public.product_images
  for each row execute function private.audit_row_change('product_image');

alter table public.product_images enable row level security;

create policy "product images: members read" on public.product_images
  for select to authenticated using (private.is_org_member(organization_id));
create policy "product images: managers write" on public.product_images
  for all to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]));

revoke all on public.product_images from anon;

-- Reorder in one statement (RLS applies: security invoker).
create or replace function public.reorder_product_images(p_product_id uuid, p_image_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.product_images i
  set sort_order = x.ord::integer
  from unnest(p_image_ids) with ordinality as x(id, ord)
  where i.id = x.id and i.product_id = p_product_id;
$$;

revoke all on function public.reorder_product_images(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_product_images(uuid, uuid[]) to authenticated;

-- -----------------------------------------------------------------------------
-- Image helpers for the storefront (paths are "<org>/<product>/<image>")
-- -----------------------------------------------------------------------------
create or replace function private.product_cover(p_product_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('path', i.organization_id || '/' || i.product_id || '/' || i.id,
                            'alt', i.alt, 'width', i.width, 'height', i.height)
  from public.product_images i
  where i.product_id = p_product_id
  order by i.sort_order, i.created_at
  limit 1;
$$;

create or replace function private.product_gallery(p_product_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'path', i.organization_id || '/' || i.product_id || '/' || i.id,
           'alt', i.alt, 'width', i.width, 'height', i.height)
         order by i.sort_order, i.created_at), '[]'::jsonb)
  from public.product_images i
  where i.product_id = p_product_id;
$$;

revoke all on function private.product_cover(uuid) from public;
revoke all on function private.product_gallery(uuid) from public;

-- Admin list: the cover photo.
create or replace view public.product_overview
with (security_invoker = true) as
select
  p.id,
  p.organization_id,
  p.title,
  p.slug,
  p.status,
  p.tracking,
  p.category_id,
  c.name as category_name,
  p.created_at,
  p.updated_at,
  coalesce(vs.variant_count, 0) as variant_count,
  vs.min_price,
  vs.max_price,
  coalesce(st.on_hand, 0)   as on_hand,
  coalesce(st.available, 0) as available,
  coalesce(st.low_locations, 0) as low_stock_locations,
  (select i.organization_id || '/' || i.product_id || '/' || i.id
   from public.product_images i where i.product_id = p.id
   order by i.sort_order, i.created_at limit 1) as cover_path
from public.products p
left join public.categories c on c.id = p.category_id
left join lateral (
  select count(*) as variant_count, min(v.price) as min_price, max(v.price) as max_price
  from public.product_variants v where v.product_id = p.id and v.is_active
) vs on true
left join lateral (
  select sum(il.on_hand) as on_hand, sum(il.available) as available,
         count(*) filter (where il.available <= il.reorder_point) as low_locations
  from public.inventory_levels il
  join public.product_variants v on v.id = il.variant_id
  where v.product_id = p.id
) st on true;

-- -----------------------------------------------------------------------------
-- Storefront functions with images
-- -----------------------------------------------------------------------------
create or replace function public.storefront_catalog(
  p_shop_id     uuid,
  p_category_id uuid default null,
  p_search      text default null,
  p_sort        text default 'newest',
  p_limit       integer default 24,
  p_offset      integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select p.id, p.slug, p.title, p.created_at, p.category_id, c.name as category_name, c.industry,
           min(v.price) as min_price, max(v.price) as max_price,
           max(v.compare_at_price) filter (where v.compare_at_price > v.price) as compare_at,
           bool_or(private.shop_available(p_shop_id, v.id) > 0) as in_stock
    from private.storefront_products(p_shop_id) p
    join public.product_variants v on v.product_id = p.id and v.is_active
    left join public.categories c on c.id = p.category_id
    where (p_category_id is null or p.category_id = p_category_id)
      and (coalesce(btrim(p_search), '') = ''
           or p.title ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
           or array_to_string(p.tags, ' ') ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%')
    group by p.id, p.slug, p.title, p.created_at, p.category_id, c.name, c.industry
  ),
  page as (
    select * from base
    order by
      in_stock desc,
      case when p_sort = 'price_asc' then min_price end asc,
      case when p_sort = 'price_desc' then min_price end desc,
      case when p_sort = 'name' then title end asc,
      created_at desc, id
    limit least(greatest(p_limit, 1), 60) offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'slug', slug, 'title', title, 'category', category_name, 'industry', industry,
        'min_price', min_price, 'max_price', max_price, 'compare_at', compare_at, 'in_stock', in_stock,
        'image', private.product_cover(id))) from page), '[]'::jsonb)
  );
$$;

create or replace function private.storefront_cards(p_shop_id uuid, p_product_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'slug', x.slug, 'title', x.title, 'category', x.category_name, 'industry', x.industry,
           'min_price', x.min_price, 'max_price', x.max_price, 'compare_at', x.compare_at, 'in_stock', x.in_stock,
           'image', private.product_cover(x.id))
         order by array_position(p_product_ids, x.id)), '[]'::jsonb)
  from (
    select p.id, p.slug, p.title, c.name as category_name, c.industry,
           min(v.price) as min_price, max(v.price) as max_price,
           max(v.compare_at_price) filter (where v.compare_at_price > v.price) as compare_at,
           bool_or(private.shop_available(p_shop_id, v.id) > 0) as in_stock
    from private.storefront_products(p_shop_id) p
    join public.product_variants v on v.product_id = p.id and v.is_active
    left join public.categories c on c.id = p.category_id
    where p.id = any (p_product_ids)
    group by p.id, p.slug, p.title, c.name, c.industry
  ) x;
$$;

create or replace function public.storefront_product(p_shop_id uuid, p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_product public.products;
begin
  select * into v_product from private.storefront_products(p_shop_id) p where p.slug = lower(p_slug);
  if v_product.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_product.id,
    'slug', v_product.slug,
    'title', v_product.title,
    'description', v_product.description,
    'tracking', v_product.tracking,
    'images', private.product_gallery(v_product.id),
    'category', (select jsonb_build_object('id', c.id, 'name', c.name, 'industry', c.industry)
                 from public.categories c where c.id = v_product.category_id),
    'details', coalesce((
      select jsonb_agg(jsonb_build_object('label', a.label, 'unit', a.unit, 'type', a.type,
                                          'value', v_product.attributes -> a.key) order by a.sort_order)
      from public.attribute_definitions a
      where a.organization_id = v_product.organization_id
        and (a.category_id = v_product.category_id or a.category_id is null)
        and not a.is_variant_option
        and v_product.attributes ? a.key), '[]'::jsonb),
    'axes', coalesce((
      select jsonb_agg(jsonb_build_object('key', a.key, 'label', a.label, 'unit', a.unit, 'type', a.type)
                       order by a.sort_order)
      from public.attribute_definitions a
      where a.organization_id = v_product.organization_id
        and (a.category_id = v_product.category_id or a.category_id is null)
        and a.is_variant_option
        and exists (select 1 from public.product_variants v
                    where v.product_id = v_product.id and v.is_active and v.options ? a.key)), '[]'::jsonb),
    'variants', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id, 'sku', v.sku, 'title', v.title, 'options', v.options, 'price', v.price,
               'compare_at', case when v.compare_at_price > v.price then v.compare_at_price end,
               'available', least(private.shop_available(p_shop_id, v.id), 10))
             order by v.price, v.created_at)
      from public.product_variants v where v.product_id = v_product.id and v.is_active), '[]'::jsonb)
  );
end;
$$;

create or replace function public.storefront_variants(p_shop_id uuid, p_variant_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', v.id, 'sku', v.sku, 'title', v.title, 'product_title', p.title, 'product_slug', p.slug,
           'price', v.price, 'compare_at', case when v.compare_at_price > v.price then v.compare_at_price end,
           'available', least(private.shop_available(p_shop_id, v.id), 99),
           'gst_rate', coalesce(p.gst_rate, c.gst_rate, 0),
           'image', private.product_cover(p.id))), '[]'::jsonb)
  from private.storefront_products(p_shop_id) p
  join public.product_variants v on v.product_id = p.id and v.is_active
  left join public.categories c on c.id = p.category_id
  where v.id = any (p_variant_ids[1:100]);
$$;
