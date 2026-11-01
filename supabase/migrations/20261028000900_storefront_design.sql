-- =============================================================================
-- Storefront design
--   * Each shop's storefront is a design document: style (fonts, corners,
--     cards, grid), header, footer, a section list for every page template
--     (home, all products, collection, product, cart) and custom pages.
--   * Staff edit a draft (autosaved, versioned against lost updates) and
--     publish it. Shoppers only ever see the published design; staff can
--     preview the draft on the storefront.
--   * The app validates the document's structure; the database enforces what
--     matters for safety: images are the shop's own uploads, links stay in the
--     shop or use https, videos come from YouTube or Vimeo, sizes are bounded.
--   * Sections need two more storefront reads: best sellers / on-sale products
--     in the catalogue, and the shop's best reviews. Newsletter sign-ups are
--     stored per shop for the business to export.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Designs
-- -----------------------------------------------------------------------------
create table public.shop_designs (
  shop_id          uuid primary key,
  organization_id  uuid not null,
  draft            jsonb,
  published        jsonb,
  -- Bumped on every change; saves must name the version they started from.
  version          integer not null default 0,
  draft_updated_at timestamptz,
  draft_updated_by uuid references auth.users (id) on delete set null,
  published_at     timestamptz,
  published_by     uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, shop_id) references public.shops (organization_id, id) on delete cascade
);
create index shop_designs_org_idx on public.shop_designs (organization_id);

alter table public.shop_designs enable row level security;
create policy "shop designs: shop staff read" on public.shop_designs
  for select to authenticated
  using (private.can_access_shop(organization_id, shop_id));
revoke all on public.shop_designs from anon;
revoke insert, update, delete, truncate on public.shop_designs from authenticated;

-- Who may change a shop's design: owners, admins and managers with access to it.
create or replace function private.can_design_shop(p_organization_id uuid, p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_org_role(p_organization_id, array['owner', 'admin', 'manager']::public.org_role[])
     and private.can_access_shop(p_organization_id, p_shop_id);
$$;

-- Safety checks on a design document (structure is checked by the app).
create or replace function private.validate_design(p_organization_id uuid, p_shop_id uuid, p_design jsonb)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_prefix  text := p_organization_id::text || '/shops/' || p_shop_id::text || '/';
  v_value   jsonb;
  v_key     text;
  v_handles text[] := '{}';
  v_handle  text;
begin
  if p_design is null or jsonb_typeof(p_design) <> 'object' then
    raise exception 'Invalid design' using errcode = 'check_violation';
  end if;
  if octet_length(p_design::text) > 262144 then
    raise exception 'This design is too large. Remove some sections or text.' using errcode = 'check_violation';
  end if;

  -- Images: the shop's own uploads only.
  for v_value in select * from jsonb_path_query(p_design, 'strict $.**.path') loop
    if jsonb_typeof(v_value) <> 'string'
       or not starts_with(v_value #>> '{}', v_prefix)
       or (v_value #>> '{}') !~ '^[0-9a-f-]{36}/shops/[0-9a-f-]{36}/[0-9a-f-]{36}$' then
      raise exception 'Images must be uploaded to this shop' using errcode = 'check_violation';
    end if;
  end loop;

  -- Links: a page in the shop (/...) or an https page.
  for v_value in select * from jsonb_path_query(p_design, 'strict $.**.link') loop
    if jsonb_typeof(v_value) <> 'string'
       or ((v_value #>> '{}') <> '' and (v_value #>> '{}') !~ '^(/([^/\\]|$)|https://[^\s]+$)')
       or char_length(v_value #>> '{}') > 300 then
      raise exception 'Links must start with / (a page in your shop) or https://' using errcode = 'check_violation';
    end if;
  end loop;

  -- Videos: YouTube or Vimeo pages.
  for v_value in select * from jsonb_path_query(p_design, 'strict $.**.video') loop
    if jsonb_typeof(v_value) <> 'string'
       or ((v_value #>> '{}') <> ''
           and (v_value #>> '{}') !~ '^https://(www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com)/[^\s]{1,200}$') then
      raise exception 'Videos must be YouTube or Vimeo links' using errcode = 'check_violation';
    end if;
  end loop;

  -- Page templates: up to 30 sections each.
  if jsonb_typeof(p_design -> 'templates') <> 'object' then
    raise exception 'Invalid design' using errcode = 'check_violation';
  end if;
  for v_key, v_value in select * from jsonb_each(p_design -> 'templates') loop
    if v_key not in ('home', 'catalogue', 'collection', 'product', 'cart')
       or jsonb_typeof(v_value -> 'sections') <> 'array'
       or jsonb_array_length(v_value -> 'sections') > 30 then
      raise exception 'A page can have up to 30 sections' using errcode = 'check_violation';
    end if;
  end loop;

  -- Custom pages: up to 20, unique handles that don't clash with the shop's policy pages.
  if jsonb_typeof(coalesce(p_design -> 'pages', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_design -> 'pages', '[]'::jsonb)) > 20 then
    raise exception 'A shop can have up to 20 pages' using errcode = 'check_violation';
  end if;
  for v_value in select * from jsonb_array_elements(coalesce(p_design -> 'pages', '[]'::jsonb)) loop
    v_handle := v_value ->> 'handle';
    if v_handle is null or v_handle !~ '^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$'
       or v_handle in ('shipping', 'returns', 'privacy', 'terms') then
      raise exception 'Page addresses use lowercase letters, numbers and dashes (and can''t be shipping, returns, privacy or terms)'
        using errcode = 'check_violation';
    end if;
    if v_handle = any (v_handles) then
      raise exception 'Two pages can''t share the address "%"', v_handle using errcode = 'check_violation';
    end if;
    if jsonb_typeof(v_value -> 'sections') <> 'array' or jsonb_array_length(v_value -> 'sections') > 30 then
      raise exception 'A page can have up to 30 sections' using errcode = 'check_violation';
    end if;
    v_handles := v_handles || v_handle;
  end loop;
end;
$$;

/*
 * Saves the draft. p_version is the version the editor loaded (0 when the
 * shop has no design yet); a mismatch means someone else saved in between.
 * Returns the new version.
 */
create or replace function public.save_design_draft(p_shop_id uuid, p_design jsonb, p_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop    public.shops;
  v_current integer;
begin
  select * into v_shop from public.shops where id = p_shop_id;
  if v_shop.id is null then
    raise exception 'Shop not found' using errcode = 'no_data_found';
  end if;
  if not private.can_design_shop(v_shop.organization_id, v_shop.id) then
    raise exception 'Only owners, admins and shop managers can change the shop''s design' using errcode = '42501';
  end if;
  perform private.validate_design(v_shop.organization_id, v_shop.id, p_design);

  insert into public.shop_designs (shop_id, organization_id)
  values (v_shop.id, v_shop.organization_id)
  on conflict (shop_id) do nothing;
  select version into v_current from public.shop_designs where shop_id = v_shop.id for update;
  if v_current <> p_version then
    raise exception 'Someone else changed this design. Reload the editor to see the latest version.'
      using errcode = 'unique_violation';
  end if;

  update public.shop_designs
  set draft = p_design, version = version + 1,
      draft_updated_at = now(), draft_updated_by = (select auth.uid())
  where shop_id = v_shop.id;
  return v_current + 1;
end;
$$;

-- Makes the draft live. Returns the new version.
create or replace function public.publish_design(p_shop_id uuid, p_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_design public.shop_designs;
begin
  select * into v_design from public.shop_designs where shop_id = p_shop_id for update;
  if v_design.shop_id is null or not private.can_design_shop(v_design.organization_id, v_design.shop_id) then
    if v_design.shop_id is not null and private.can_access_shop(v_design.organization_id, v_design.shop_id) then
      raise exception 'Only owners, admins and shop managers can change the shop''s design' using errcode = '42501';
    end if;
    raise exception 'Nothing to publish yet' using errcode = 'no_data_found';
  end if;
  if v_design.version <> p_version then
    raise exception 'Someone else changed this design. Reload the editor to see the latest version.'
      using errcode = 'unique_violation';
  end if;
  if v_design.draft is null then
    raise exception 'There are no unpublished changes' using errcode = 'check_violation';
  end if;
  perform private.validate_design(v_design.organization_id, v_design.shop_id, v_design.draft);

  update public.shop_designs
  set published = draft, draft = null, version = version + 1,
      published_at = now(), published_by = (select auth.uid())
  where shop_id = p_shop_id;

  perform private.log_audit(v_design.organization_id, 'shop.design_published', 'shop', v_design.shop_id,
    jsonb_build_object('pages', jsonb_array_length(coalesce(v_design.draft -> 'pages', '[]'::jsonb))));
  return v_design.version + 1;
end;
$$;

-- Throws the draft away (back to what's live). Returns the new version.
create or replace function public.discard_design_draft(p_shop_id uuid, p_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_design public.shop_designs;
begin
  select * into v_design from public.shop_designs where shop_id = p_shop_id for update;
  if v_design.shop_id is null or not private.can_design_shop(v_design.organization_id, v_design.shop_id) then
    raise exception 'Nothing to discard' using errcode = 'no_data_found';
  end if;
  if v_design.version <> p_version then
    raise exception 'Someone else changed this design. Reload the editor to see the latest version.'
      using errcode = 'unique_violation';
  end if;
  update public.shop_designs
  set draft = null, version = version + 1, draft_updated_at = now(), draft_updated_by = (select auth.uid())
  where shop_id = p_shop_id;
  return v_design.version + 1;
end;
$$;

/*
 * The design a storefront shows: the published one, or (p_preview, for the
 * shop's own staff) the draft. Null: the shop uses the default layout.
 */
create or replace function public.storefront_design(p_shop_id uuid, p_preview boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when p_preview and (select auth.uid()) is not null
                and private.can_access_shop(d.organization_id, d.shop_id)
             then coalesce(d.draft, d.published)
           else d.published
         end
  from public.shop_designs d
  join public.shops s on s.id = d.shop_id
  where d.shop_id = p_shop_id and private.storefront_visible(s);
$$;

-- -----------------------------------------------------------------------------
-- Catalogue: best sellers and on-sale products
-- -----------------------------------------------------------------------------
drop function public.storefront_catalog(uuid, uuid, text, text, integer, integer, numeric, numeric, boolean, uuid);

-- Units sold from a shop in the last 90 days (confirmed or completed orders).
create or replace function private.product_units_sold(p_shop_id uuid, p_product_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(oi.quantity), 0)
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  join public.product_variants v on v.id = oi.variant_id
  where o.shop_id = p_shop_id
    and v.product_id = p_product_id
    and o.status in ('confirmed', 'completed')
    and o.placed_at > now() - interval '90 days';
$$;

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
  p_collection_id uuid default null,
  p_on_sale       boolean default false
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
      and (not coalesce(p_on_sale, false) or compare_at is not null)
  ),
  page as (
    select * from base
    order by
      in_stock desc,
      case when p_sort = 'relevance' or (p_sort = 'newest' and (select term from q) is not null) then relevance end desc nulls last,
      case when p_sort = 'featured' then position end asc nulls last,
      case when p_sort = 'bestselling' then private.product_units_sold(p_shop_id, id) end desc nulls last,
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

-- -----------------------------------------------------------------------------
-- The shop's best reviews (for a reviews section)
-- -----------------------------------------------------------------------------
create or replace function public.storefront_shop_reviews(p_shop_id uuid, p_min_rating integer default 4, p_limit integer default 6)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'rating', r.rating, 'title', r.title, 'body', r.body, 'created_at', r.created_at,
      'product_title', r.product_title, 'product_slug', r.product_slug,
      'author', coalesce(split_part(btrim(c.full_name), ' ', 1)
                  || case when strpos(btrim(c.full_name), ' ') > 0
                          then ' ' || left(split_part(btrim(c.full_name), ' ', 2), 1) || '.' else '' end,
                'A customer')) order by r.rating desc, r.created_at desc), '[]'::jsonb)
  from (
    select rv.*, p.title as product_title, p.slug as product_slug
    from public.product_reviews rv
    join private.storefront_products(p_shop_id) p on p.id = rv.product_id
    where rv.status = 'published'
      and rv.rating >= least(greatest(coalesce(p_min_rating, 4), 1), 5)
      and coalesce(btrim(rv.body), '') <> ''
    order by rv.rating desc, rv.created_at desc
    limit least(greatest(coalesce(p_limit, 6), 1), 12)
  ) r
  join public.customers c on c.id = r.customer_id;
$$;

-- -----------------------------------------------------------------------------
-- Newsletter sign-ups
-- -----------------------------------------------------------------------------
create table public.newsletter_subscribers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  shop_id         uuid not null,
  email           extensions.citext not null check (char_length(email) between 3 and 254),
  created_at      timestamptz not null default now(),
  foreign key (organization_id, shop_id) references public.shops (organization_id, id) on delete cascade
);
create unique index newsletter_subscribers_email_uidx on public.newsletter_subscribers (shop_id, lower(email::text));
create index newsletter_subscribers_org_idx on public.newsletter_subscribers (organization_id, created_at desc);

alter table public.newsletter_subscribers enable row level security;
create policy "newsletter: managers read" on public.newsletter_subscribers
  for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[])
         and private.can_access_shop(organization_id, shop_id));
revoke all on public.newsletter_subscribers from anon;
revoke insert, update, delete, truncate on public.newsletter_subscribers from authenticated;

/*
 * A shopper signs up from a newsletter section. Says nothing about whether the
 * address was already on the list. Throttled per shop against floods.
 */
create or replace function public.newsletter_subscribe(p_shop_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop  public.shops;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  select * into v_shop from public.shops where id = p_shop_id;
  if v_shop.id is null or v_shop.status <> 'live' then
    raise exception 'Shop not found' using errcode = 'no_data_found';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'Enter a valid email address' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.newsletter_subscribers
      where shop_id = v_shop.id and created_at > now() - interval '10 minutes') >= 100 then
    raise exception 'Too many sign-ups right now. Please try again in a few minutes.' using errcode = 'check_violation';
  end if;
  insert into public.newsletter_subscribers (organization_id, shop_id, email)
  values (v_shop.organization_id, v_shop.id, v_email)
  on conflict (shop_id, lower(email::text)) do nothing;
end;
$$;

create or replace function public.remove_newsletter_subscriber(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.newsletter_subscribers;
begin
  select * into v_row from public.newsletter_subscribers where id = p_id;
  if v_row.id is null or not (
       private.has_org_role(v_row.organization_id, array['owner', 'admin', 'manager']::public.org_role[])
       and private.can_access_shop(v_row.organization_id, v_row.shop_id)) then
    raise exception 'Subscriber not found' using errcode = 'no_data_found';
  end if;
  delete from public.newsletter_subscribers where id = p_id;
  perform private.log_audit(v_row.organization_id, 'newsletter.subscriber_removed', 'shop', v_row.shop_id,
    jsonb_build_object('email', v_row.email::text));
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function private.can_design_shop(uuid, uuid) from public;
revoke all on function private.validate_design(uuid, uuid, jsonb) from public;
revoke all on function private.product_units_sold(uuid, uuid) from public;
revoke all on function public.save_design_draft(uuid, jsonb, integer) from public, anon;
revoke all on function public.publish_design(uuid, integer) from public, anon;
revoke all on function public.discard_design_draft(uuid, integer) from public, anon;
revoke all on function public.storefront_design(uuid, boolean) from public;
revoke all on function public.storefront_catalog(uuid, uuid, text, text, integer, integer, numeric, numeric, boolean, uuid, boolean) from public;
revoke all on function public.storefront_shop_reviews(uuid, integer, integer) from public;
revoke all on function public.newsletter_subscribe(uuid, text) from public;
revoke all on function public.remove_newsletter_subscriber(uuid) from public, anon;

grant execute on function public.save_design_draft(uuid, jsonb, integer) to authenticated;
grant execute on function public.publish_design(uuid, integer) to authenticated;
grant execute on function public.discard_design_draft(uuid, integer) to authenticated;
grant execute on function public.storefront_design(uuid, boolean) to anon, authenticated;
grant execute on function public.storefront_catalog(uuid, uuid, text, text, integer, integer, numeric, numeric, boolean, uuid, boolean) to anon, authenticated;
grant execute on function public.storefront_shop_reviews(uuid, integer, integer) to anon, authenticated;
grant execute on function public.newsletter_subscribe(uuid, text) to anon, authenticated;
grant execute on function public.remove_newsletter_subscriber(uuid) to authenticated;
