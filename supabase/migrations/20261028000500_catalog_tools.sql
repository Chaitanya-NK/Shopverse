-- =============================================================================
-- Shopverse · Migration 023 · Catalogue power tools
--
--  * Photos per variant: a photo can belong to one variant ("Red"); the
--    storefront shows that variant's photos first when it is chosen.
--  * Collections: hand-picked, ordered groups of products per shop, with a
--    page each and optional homepage sections.
--  * Reviews: 1–5 stars from verified buyers (a delivered order with the
--    product), one per customer and product, published at once; staff can
--    hide a review and reply.
--  * Related products and typo-tolerant search (pg_trgm) on the storefront.
--  * CSV import/export is done by the app with create_product/update_product.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;
create index if not exists products_title_trgm_idx on public.products using gin (title extensions.gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- Photos per variant
-- -----------------------------------------------------------------------------
alter table public.product_images
  add column variant_id uuid,
  add constraint product_images_variant_fk foreign key (organization_id, variant_id)
    references public.product_variants (organization_id, id) on delete set null (variant_id);

create or replace function private.product_image_variant_valid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.variant_id is not null and not exists (
    select 1 from public.product_variants where id = new.variant_id and product_id = new.product_id
  ) then
    raise exception 'Choose an option of this product' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger product_images_variant_valid
  before insert or update of variant_id on public.product_images
  for each row execute function private.product_image_variant_valid();

create or replace function private.product_gallery(p_product_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'path', i.organization_id || '/' || i.product_id || '/' || i.id,
           'alt', i.alt, 'width', i.width, 'height', i.height, 'variant_id', i.variant_id)
         order by i.sort_order, i.created_at), '[]'::jsonb)
  from public.product_images i
  where i.product_id = p_product_id;
$$;

-- -----------------------------------------------------------------------------
-- Collections
-- -----------------------------------------------------------------------------
create table public.collections (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  shop_id         uuid not null,
  title           text not null check (char_length(btrim(title)) between 2 and 80),
  slug            text not null check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$'),
  description     text check (char_length(description) <= 1000),
  -- Shown as a section on the shop's homepage (in sort_order).
  featured        boolean not null default false,
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (shop_id, slug),
  unique (organization_id, id),
  foreign key (organization_id, shop_id) references public.shops (organization_id, id) on delete cascade
);

create table public.collection_products (
  organization_id uuid not null,
  collection_id   uuid not null,
  product_id      uuid not null,
  position        integer not null default 0,
  added_at        timestamptz not null default now(),
  primary key (collection_id, product_id),
  foreign key (organization_id, collection_id) references public.collections (organization_id, id) on delete cascade,
  foreign key (organization_id, product_id) references public.products (organization_id, id) on delete cascade
);
create index collection_products_product_idx on public.collection_products (product_id);

create trigger collections_set_updated_at
  before update on public.collections
  for each row execute function private.set_updated_at();
create trigger collections_audit
  after insert or update or delete on public.collections
  for each row execute function private.audit_row_change('collection');

alter table public.collections enable row level security;
alter table public.collection_products enable row level security;
create policy "collections: members read" on public.collections
  for select to authenticated using (private.is_org_member(organization_id));
create policy "collections: managers write" on public.collections
  for all to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[])
         and private.can_access_shop(organization_id, shop_id))
  with check (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[])
              and private.can_access_shop(organization_id, shop_id));
create policy "collection products: members read" on public.collection_products
  for select to authenticated using (private.is_org_member(organization_id));
create policy "collection products: managers write" on public.collection_products
  for all to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]));
revoke all on public.collections, public.collection_products from anon;

-- Put a collection's products in this order (ids not listed keep their place after).
create or replace function public.reorder_collection(p_collection_id uuid, p_product_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.collection_products cp
  set position = x.ord
  from unnest(p_product_ids) with ordinality as x(product_id, ord)
  where cp.collection_id = p_collection_id and cp.product_id = x.product_id;
$$;

-- -----------------------------------------------------------------------------
-- Reviews
-- -----------------------------------------------------------------------------
create table public.product_reviews (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  shop_id         uuid not null,
  product_id      uuid not null,
  customer_id     uuid not null,
  rating          smallint not null check (rating between 1 and 5),
  title           text check (char_length(title) <= 120),
  body            text check (char_length(body) <= 2000),
  status          text not null default 'published' check (status in ('published', 'hidden')),
  reply           text check (char_length(reply) <= 1000),
  replied_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (product_id, customer_id),
  foreign key (organization_id, product_id) references public.products (organization_id, id) on delete cascade,
  foreign key (organization_id, shop_id) references public.shops (organization_id, id) on delete cascade,
  foreign key (customer_id) references public.customers (id) on delete cascade
);
create index product_reviews_product_idx on public.product_reviews (product_id, status, created_at desc);
create index product_reviews_org_idx on public.product_reviews (organization_id, created_at desc);

create trigger product_reviews_set_updated_at
  before update on public.product_reviews
  for each row execute function private.set_updated_at();

alter table public.product_reviews enable row level security;
create policy "reviews: members read" on public.product_reviews
  for select to authenticated using (private.can_access_shop(organization_id, shop_id));
revoke insert, update, delete on public.product_reviews from authenticated, anon;
grant select on public.product_reviews to authenticated;

-- Average and count of published reviews for a product.
create or replace function private.product_rating(p_product_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when count(*) = 0 then null
              else jsonb_build_object('average', round(avg(rating), 1), 'count', count(*)) end
  from public.product_reviews where product_id = p_product_id and status = 'published';
$$;

-- Has this customer had the product delivered from this business?
create or replace function private.verified_buyer(p_customer_id uuid, p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.product_variants v on v.id = oi.variant_id
    where o.customer_id = p_customer_id and v.product_id = p_product_id and o.status <> 'cancelled'
      and (o.status = 'completed' or exists (
        select 1 from public.shipment_items si join public.shipments sh on sh.id = si.shipment_id
        where si.order_item_id = oi.id and sh.status = 'delivered')));
$$;

create or replace function public.shopper_review_status(p_shop_id uuid, p_token text, p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer public.customers := private.shopper_customer(p_shop_id, p_token);
  v_review   public.product_reviews;
begin
  if v_customer.id is null then
    return jsonb_build_object('signed_in', false, 'eligible', false);
  end if;
  select * into v_review from public.product_reviews where product_id = p_product_id and customer_id = v_customer.id;
  return jsonb_build_object(
    'signed_in', true,
    'eligible', private.verified_buyer(v_customer.id, p_product_id),
    'review', case when v_review.id is null then null else jsonb_build_object(
      'rating', v_review.rating, 'title', v_review.title, 'body', v_review.body, 'status', v_review.status) end);
end;
$$;

create or replace function public.shopper_save_review(
  p_shop_id uuid, p_token text, p_product_id uuid, p_rating integer, p_title text, p_body text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_customer public.customers := private.require_shopper(p_shop_id, p_token);
  v_product  public.products;
begin
  select p.* into v_product from private.storefront_products(p_shop_id) p where p.id = p_product_id;
  if v_product.id is null then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;
  if not private.verified_buyer(v_customer.id, p_product_id) then
    raise exception 'Reviews are from customers who have received this product' using errcode = '42501';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Choose 1 to 5 stars' using errcode = 'check_violation';
  end if;
  insert into public.product_reviews (organization_id, shop_id, product_id, customer_id, rating, title, body)
  values (v_product.organization_id, p_shop_id, p_product_id, v_customer.id, p_rating,
          nullif(left(btrim(p_title), 120), ''), nullif(left(btrim(p_body), 2000), ''))
  on conflict (product_id, customer_id) do update
    set rating = excluded.rating, title = excluded.title, body = excluded.body, shop_id = excluded.shop_id;
end;
$$;

-- Public: published reviews of a product, newest first, with the rating summary.
create or replace function public.storefront_reviews(p_shop_id uuid, p_product_id uuid, p_limit integer default 10, p_offset integer default 0)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with product as (
    select p.id from private.storefront_products(p_shop_id) p where p.id = p_product_id
  ), published as (
    select r.* from public.product_reviews r join product on product.id = r.product_id where r.status = 'published'
  )
  select jsonb_build_object(
    'average', (select round(avg(rating), 1) from published),
    'count', (select count(*) from published),
    'distribution', (select jsonb_object_agg(s, (select count(*) from published where rating = s))
                     from generate_series(1, 5) s),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'rating', r.rating, 'title', r.title, 'body', r.body, 'created_at', r.created_at,
        'reply', r.reply,
        'author', coalesce(split_part(btrim(c.full_name), ' ', 1)
                    || case when strpos(btrim(c.full_name), ' ') > 0
                            then ' ' || left(split_part(btrim(c.full_name), ' ', 2), 1) || '.' else '' end,
                  'A customer')) order by r.created_at desc)
      from (select * from published order by created_at desc
            limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)) r
      join public.customers c on c.id = r.customer_id), '[]'::jsonb));
$$;

create or replace function public.moderate_review(p_review_id uuid, p_status text, p_reply text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.product_reviews;
begin
  select * into v_review from public.product_reviews where id = p_review_id for update;
  if v_review.id is null or not private.can_access_shop(v_review.organization_id, v_review.shop_id) then
    raise exception 'Review not found' using errcode = 'P0002';
  end if;
  if not private.has_org_role(v_review.organization_id, array['owner', 'admin', 'manager', 'support']::public.org_role[]) then
    raise exception 'Not allowed to moderate reviews' using errcode = '42501';
  end if;
  if p_status not in ('published', 'hidden') then
    raise exception 'Unknown status' using errcode = 'check_violation';
  end if;
  update public.product_reviews
  set status = p_status,
      reply = case when p_reply is null then reply else nullif(left(btrim(p_reply), 1000), '') end,
      replied_at = case when p_reply is null then replied_at when nullif(btrim(p_reply), '') is null then null else now() end
  where id = p_review_id;
  perform private.log_audit(v_review.organization_id, 'review.' || case when p_status = v_review.status then 'replied' else p_status end,
    'review', p_review_id, jsonb_build_object('rating', v_review.rating));
end;
$$;

create or replace view public.review_overview
with (security_invoker = true) as
select r.id, r.organization_id, r.shop_id, s.name as shop_name, r.product_id, p.title as product_title, p.slug as product_slug,
       r.rating, r.title, r.body, r.status, r.reply, r.created_at,
       c.full_name as customer_name, c.email as customer_email
from public.product_reviews r
join public.products p on p.id = r.product_id
join public.shops s on s.id = r.shop_id
join public.customers c on c.id = r.customer_id;
grant select on public.review_overview to authenticated;

-- -----------------------------------------------------------------------------
-- Storefront: collections, search, related products, ratings
-- -----------------------------------------------------------------------------
drop function public.storefront_catalog(uuid, uuid, text, text, integer, integer, numeric, numeric, boolean);

create or replace function public.storefront_catalog(
  p_shop_id       uuid,
  p_category_id   uuid default null,
  p_search        text default null,
  p_sort          text default 'newest',
  p_limit         integer default 24,
  p_offset        integer default 0,
  p_min_price     numeric default null,
  p_max_price     numeric default null,
  p_in_stock      boolean default false,
  p_collection_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with q as (select nullif(lower(btrim(left(p_search, 100))), '') as term),
  matching as (
    select p.id, p.slug, p.title, p.created_at, p.category_id, c.name as category_name, c.industry,
           min(v.price) as min_price, max(v.price) as max_price,
           max(v.compare_at_price) filter (where v.compare_at_price > v.price) as compare_at,
           bool_or(private.shop_available(p_shop_id, v.id) > 0) as in_stock,
           max(cp.position) as position,
           -- Relevance: exact words first, then near matches (typos).
           case when (select term from q) is null then 0
                else greatest(
                  case when strpos(lower(p.title), (select term from q)) > 0 then 1 else 0 end,
                  extensions.word_similarity((select term from q), lower(p.title)),
                  case when strpos(lower(array_to_string(p.tags, ' ')), (select term from q)) > 0 then 0.9 else 0 end,
                  case when bool_or(lower(v.sku) = (select term from q)) then 1 else 0 end) end as relevance
    from private.storefront_products(p_shop_id) p
    join public.product_variants v on v.product_id = p.id and v.is_active
    left join public.categories c on c.id = p.category_id
    left join public.collection_products cp on cp.product_id = p.id and cp.collection_id = p_collection_id
    where (p_category_id is null or p.category_id = p_category_id)
      and (p_collection_id is null or cp.product_id is not null)
    group by p.id, p.slug, p.title, p.created_at, p.category_id, c.name, c.industry, p.tags
  ),
  searched as (
    select * from matching where (select term from q) is null or relevance >= 0.45
  ),
  -- A product matches a price range when any of its variants falls inside it.
  base as (
    select * from searched
    where (p_min_price is null or max_price >= p_min_price)
      and (p_max_price is null or min_price <= p_max_price)
      and (not coalesce(p_in_stock, false) or in_stock)
  ),
  page as (
    select * from base
    order by
      in_stock desc,
      case when p_sort = 'relevance' or (p_sort = 'newest' and (select term from q) is not null) then relevance end desc nulls last,
      case when p_sort = 'featured' then position end asc nulls last,
      case when p_sort = 'price_asc' then min_price end asc,
      case when p_sort = 'price_desc' then min_price end desc,
      case when p_sort = 'name' then title end asc,
      case when p_sort = 'rating' then (private.product_rating(id) ->> 'average')::numeric end desc nulls last,
      created_at desc, id
    limit least(greatest(p_limit, 1), 60) offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'price_range', (select jsonb_build_object('min', min(min_price), 'max', max(max_price)) from searched),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'slug', slug, 'title', title, 'category', category_name, 'industry', industry,
        'min_price', min_price, 'max_price', max_price, 'compare_at', compare_at, 'in_stock', in_stock,
        'image', private.product_cover(id), 'rating', private.product_rating(id))) from page), '[]'::jsonb)
  );
$$;

create or replace function public.storefront_collections(p_shop_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'title', c.title,
                                               'description', c.description, 'featured', c.featured)
                            order by c.sort_order, c.title), '[]'::jsonb)
  from public.collections c
  join public.shops s on s.id = c.shop_id
  where c.shop_id = p_shop_id and c.is_active and private.storefront_visible(s)
    and exists (select 1 from public.collection_products cp
                join private.storefront_products(p_shop_id) p on p.id = cp.product_id
                where cp.collection_id = c.id);
$$;

create or replace function public.storefront_related(p_shop_id uuid, p_product_id uuid, p_limit integer default 8)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select * from public.products where id = p_product_id),
  candidates as (
    select p.id, p.slug, p.title, c.name as category_name, c.industry,
           min(v.price) as min_price, max(v.price) as max_price,
           max(v.compare_at_price) filter (where v.compare_at_price > v.price) as compare_at,
           bool_or(private.shop_available(p_shop_id, v.id) > 0) as in_stock,
           -- Same category, then shared tags, then in the same collections.
           (case when p.category_id = (select category_id from me) then 3 else 0 end)
           + cardinality(array(select unnest(p.tags) intersect select unnest((select tags from me))))
           + (select count(*) from public.collection_products a join public.collection_products b on a.collection_id = b.collection_id
              where a.product_id = p.id and b.product_id = p_product_id) as score
    from private.storefront_products(p_shop_id) p
    join public.product_variants v on v.product_id = p.id and v.is_active
    left join public.categories c on c.id = p.category_id
    where p.id <> p_product_id
    group by p.id, p.slug, p.title, c.name, c.industry, p.category_id, p.tags
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'slug', slug, 'title', title, 'category', category_name, 'industry', industry,
      'min_price', min_price, 'max_price', max_price, 'compare_at', compare_at, 'in_stock', in_stock,
      'image', private.product_cover(id), 'rating', private.product_rating(id))), '[]'::jsonb)
  from (select * from candidates where score > 0 order by in_stock desc, score desc, title
        limit least(greatest(p_limit, 1), 12)) x;
$$;

-- Product page: the rating summary too.
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
    'rating', private.product_rating(v_product.id),
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

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function private.product_image_variant_valid() from public;
revoke all on function private.product_rating(uuid) from public;
revoke all on function private.verified_buyer(uuid, uuid) from public;

revoke all on function public.reorder_collection(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_collection(uuid, uuid[]) to authenticated;
revoke all on function public.moderate_review(uuid, text, text) from public, anon;
grant execute on function public.moderate_review(uuid, text, text) to authenticated;

revoke all on function public.storefront_catalog(uuid, uuid, text, text, integer, integer, numeric, numeric, boolean, uuid) from public;
grant execute on function public.storefront_catalog(uuid, uuid, text, text, integer, integer, numeric, numeric, boolean, uuid) to anon, authenticated;
revoke all on function public.storefront_collections(uuid) from public;
grant execute on function public.storefront_collections(uuid) to anon, authenticated;
revoke all on function public.storefront_related(uuid, uuid, integer) from public;
grant execute on function public.storefront_related(uuid, uuid, integer) to anon, authenticated;
revoke all on function public.storefront_reviews(uuid, uuid, integer, integer) from public;
grant execute on function public.storefront_reviews(uuid, uuid, integer, integer) to anon, authenticated;

revoke all on function public.shopper_review_status(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.shopper_review_status(uuid, text, uuid) to service_role;
revoke all on function public.shopper_save_review(uuid, text, uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.shopper_save_review(uuid, text, uuid, integer, text, text) to service_role;
