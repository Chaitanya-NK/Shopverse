-- =============================================================================
-- Shopverse · Migration 017 · Storefront pages, filters and sitemap data
--
--  * storefront_shop also returns which policy pages exist and the business
--    details for the contact page.
--  * storefront_policy returns one policy page's text.
--  * storefront_catalog gains price range and in-stock filters, and reports
--    the price range of the current selection.
--  * storefront_sitemap lists a live shop's products for search engines.
-- =============================================================================

create or replace function public.storefront_shop(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_shop public.shops;
begin
  select * into v_shop from public.shops where slug = lower(p_slug);
  if not private.storefront_visible(v_shop) then
    return null;
  end if;
  return jsonb_build_object(
    'id', v_shop.id,
    'name', v_shop.name,
    'slug', v_shop.slug,
    'currency', v_shop.currency,
    'live', v_shop.status = 'live',
    'tagline', v_shop.settings ->> 'tagline',
    'support_email', v_shop.settings ->> 'support_email',
    'support_phone', v_shop.settings ->> 'support_phone',
    'shipping_fee', coalesce(private.shop_setting_numeric(v_shop.settings, 'shipping_fee'), 0),
    'free_shipping_over', private.shop_setting_numeric(v_shop.settings, 'free_shipping_over'),
    'cod_limit', private.shop_setting_numeric(v_shop.settings, 'cod_limit'),
    'legal_name', nullif(v_shop.settings ->> 'legal_name', ''),
    'gstin', nullif(v_shop.settings ->> 'gstin', ''),
    'business_address', v_shop.settings -> 'business_address',
    'policies', (
      select coalesce(jsonb_agg(k.page order by k.ord), '[]'::jsonb)
      from (values (1, 'shipping'), (2, 'returns'), (3, 'privacy'), (4, 'terms')) as k(ord, page)
      where coalesce(btrim(v_shop.settings ->> ('policy_' || k.page)), '') <> '')
  );
end;
$$;

create or replace function public.storefront_policy(p_slug text, p_page text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(btrim(s.settings ->> ('policy_' || p_page)), '')
  from public.shops s
  where s.slug = lower(p_slug)
    and p_page in ('shipping', 'returns', 'privacy', 'terms')
    and private.storefront_visible(s);
$$;

drop function public.storefront_catalog(uuid, uuid, text, text, integer, integer);

create or replace function public.storefront_catalog(
  p_shop_id     uuid,
  p_category_id uuid default null,
  p_search      text default null,
  p_sort        text default 'newest',
  p_limit       integer default 24,
  p_offset      integer default 0,
  p_min_price   numeric default null,
  p_max_price   numeric default null,
  p_in_stock    boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with matching as (
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
  -- A product matches a price range when any of its variants falls inside it.
  base as (
    select * from matching
    where (p_min_price is null or max_price >= p_min_price)
      and (p_max_price is null or min_price <= p_max_price)
      and (not coalesce(p_in_stock, false) or in_stock)
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
    'price_range', (select jsonb_build_object('min', min(min_price), 'max', max(max_price)) from matching),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'slug', slug, 'title', title, 'category', category_name, 'industry', industry,
        'min_price', min_price, 'max_price', max_price, 'compare_at', compare_at, 'in_stock', in_stock,
        'image', private.product_cover(id))) from page), '[]'::jsonb)
  );
$$;

-- Products of a live shop for its sitemap (drafts are never listed).
create or replace function public.storefront_sitemap(p_shop_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', x.slug, 'updated_at', x.updated_at)), '[]'::jsonb)
  from (
    select p.slug, p.updated_at
    from public.products p
    join public.shop_products sp on sp.product_id = p.id and sp.shop_id = p_shop_id and sp.is_published
    join public.shops s on s.id = p_shop_id and s.status = 'live'
    where p.status = 'active'
    order by p.updated_at desc
    limit 5000
  ) x;
$$;

revoke all on function public.storefront_policy(text, text) from public;
revoke all on function public.storefront_catalog(uuid, uuid, text, text, integer, integer, numeric, numeric, boolean) from public;
revoke all on function public.storefront_sitemap(uuid) from public;
grant execute on function public.storefront_policy(text, text) to anon, authenticated;
grant execute on function public.storefront_catalog(uuid, uuid, text, text, integer, integer, numeric, numeric, boolean) to anon, authenticated;
grant execute on function public.storefront_sitemap(uuid) to anon, authenticated;
