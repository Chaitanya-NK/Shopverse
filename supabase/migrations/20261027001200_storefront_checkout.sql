-- =============================================================================
-- Shopverse · Migration 012 · Storefront, checkout with email OTP, customers
--
--  * Shop handles become globally unique (they are the storefront address).
--  * Order creation is split into a shared core used by staff (create_order)
--    and by the storefront checkout.
--  * Public catalogue reads are SECURITY DEFINER functions granted to anon,
--    returning only live shops' published products (staff may preview).
--  * Checkout sessions live in the private schema. Only the server (service
--    role) can start or confirm them, because they return the plain OTP for
--    emailing; the database keeps a bcrypt hash.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shops & orders
-- -----------------------------------------------------------------------------
alter table public.shops add constraint shops_slug_key unique (slug);

alter table public.orders
  add column source text not null default 'admin' check (source in ('admin', 'storefront')),
  -- Unguessable link for the customer's order status page.
  add column public_token text not null default encode(extensions.gen_random_bytes(16), 'hex');

create unique index orders_public_token_uidx on public.orders (public_token);

-- Storefront settings stored in shops.settings, read with defaults.
create or replace function private.shop_setting_numeric(p_settings jsonb, p_key text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_settings -> p_key) = 'number' then (p_settings ->> p_key)::numeric end;
$$;

-- -----------------------------------------------------------------------------
-- Order core: shared by staff entry and the storefront
-- -----------------------------------------------------------------------------
create or replace function private.create_order_core(
  p_shop_id         uuid,
  p_customer        jsonb,
  p_address         jsonb,
  p_items           jsonb,
  p_payment_method  public.payment_method,
  p_payment_status  public.payment_status,
  p_shipping_total  numeric,
  p_discount_total  numeric,
  p_notes           text,
  p_source          text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop        public.shops;
  v_order_id    uuid;
  v_customer_id uuid;
  v_email       text := nullif(lower(btrim(p_customer ->> 'email')), '');
  v_phone       text := nullif(regexp_replace(coalesce(p_customer ->> 'phone', ''), '[\s()-]', '', 'g'), '');
  v_name        text := nullif(btrim(p_customer ->> 'full_name'), '');
  v_line        jsonb;
  v_variant     record;
  v_qty         integer;
  v_price       numeric;
  v_tax_line    numeric;
  v_subtotal    numeric := 0;
  v_tax         numeric := 0;
begin
  select * into v_shop from public.shops where id = p_shop_id;
  if v_shop.id is null then
    raise exception 'Shop not found' using errcode = 'no_data_found';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'An order can have at most 100 lines' using errcode = 'check_violation';
  end if;
  if (select count(distinct x ->> 'variant_id') from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) then
    raise exception 'Each product variant can appear only once' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_address ->> 'name'), '') = '' or coalesce(btrim(p_address ->> 'line1'), '') = ''
     or coalesce(btrim(p_address ->> 'city'), '') = '' or coalesce(btrim(p_address ->> 'postal_code'), '') = ''
     or coalesce(btrim(p_address ->> 'phone'), '') = '' then
    raise exception 'The shipping address needs a name, phone, street, city and PIN code' using errcode = 'check_violation';
  end if;
  if p_shipping_total < 0 or p_discount_total < 0 then
    raise exception 'Shipping and discount cannot be negative' using errcode = 'check_violation';
  end if;

  -- Customer: match on email, then phone, within the organization.
  if v_email is not null or v_phone is not null then
    select id into v_customer_id from public.customers
    where organization_id = v_shop.organization_id
      and ((v_email is not null and email = v_email::extensions.citext) or (v_phone is not null and phone = v_phone))
    order by (email = v_email::extensions.citext) desc nulls last
    limit 1;

    if v_customer_id is null then
      insert into public.customers (organization_id, email, phone, full_name)
      values (v_shop.organization_id, v_email, v_phone, v_name)
      returning id into v_customer_id;
    else
      update public.customers
      set full_name = coalesce(full_name, v_name),
          email = coalesce(email, v_email::extensions.citext),
          phone = coalesce(phone, v_phone)
      where id = v_customer_id;
    end if;
  end if;

  insert into public.orders (
    organization_id, shop_id, customer_id, payment_method, payment_status, currency,
    shipping_total, discount_total, shipping_address, notes, paid_at, source
  ) values (
    v_shop.organization_id, v_shop.id, v_customer_id, p_payment_method, p_payment_status, v_shop.currency,
    round(p_shipping_total, 2), round(p_discount_total, 2), p_address, nullif(btrim(p_notes), ''),
    case when p_payment_status = 'paid' then now() end, p_source
  )
  returning id into v_order_id;

  for v_line in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_line ->> 'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 10000 then
      raise exception 'Quantities must be between 1 and 10,000' using errcode = 'check_violation';
    end if;

    select v.id, v.sku, v.price, v.title as variant_title, p.title as product_title, p.tracking, p.status,
           coalesce(p.gst_rate, c.gst_rate, 0) as gst_rate
    into v_variant
    from public.product_variants v
    join public.products p on p.id = v.product_id
    left join public.categories c on c.id = p.category_id
    where v.id = (v_line ->> 'variant_id')::uuid
      and v.organization_id = v_shop.organization_id
      and v.is_active;

    if v_variant.id is null then
      raise exception 'A product in this order is no longer available' using errcode = 'check_violation';
    end if;
    if v_variant.status = 'archived' then
      raise exception '% is no longer sold', v_variant.product_title using errcode = 'check_violation';
    end if;

    v_price := round(coalesce((v_line ->> 'unit_price')::numeric, v_variant.price), 2);
    if v_price < 0 then
      raise exception 'Prices cannot be negative' using errcode = 'check_violation';
    end if;
    v_tax_line := round(v_qty * v_price * v_variant.gst_rate / (100 + v_variant.gst_rate), 2);

    insert into public.order_items (
      organization_id, order_id, variant_id, title, sku, quantity, unit_price, tracking, gst_rate, tax_amount
    ) values (
      v_shop.organization_id, v_order_id, v_variant.id,
      v_variant.product_title || case when v_variant.variant_title <> 'Default' then ' · ' || v_variant.variant_title else '' end,
      v_variant.sku, v_qty, v_price, v_variant.tracking, v_variant.gst_rate, v_tax_line
    );

    v_subtotal := v_subtotal + v_qty * v_price;
    v_tax := v_tax + v_tax_line;
  end loop;

  if p_discount_total > v_subtotal then
    raise exception 'The discount is larger than the order subtotal' using errcode = 'check_violation';
  end if;

  update public.orders
  set subtotal = v_subtotal,
      tax_total = v_tax,
      grand_total = v_subtotal - round(p_discount_total, 2) + round(p_shipping_total, 2)
  where id = v_order_id;

  perform private.add_order_event(v_shop.organization_id, v_order_id, 'order.created',
    case when p_source = 'storefront' then 'Placed online by the customer' else 'Order created' end,
    jsonb_build_object('lines', jsonb_array_length(p_items), 'source', p_source));

  return v_order_id;
end;
$$;

create or replace function private.confirm_order_core(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_wh    text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.status <> 'pending' then
    raise exception 'Only pending orders can be confirmed' using errcode = 'check_violation';
  end if;

  perform private.route_order(p_order_id);
  update public.orders set status = 'confirmed', confirmed_at = now() where id = p_order_id;

  select string_agg(distinct w.name, ', ') into v_wh
  from public.order_allocations a join public.warehouses w on w.id = a.warehouse_id
  where a.order_id = p_order_id;

  perform private.add_order_event(v_order.organization_id, p_order_id, 'order.confirmed',
    'Confirmed; stock reserved at ' || v_wh);
end;
$$;

-- Staff entry points keep their signatures; they now delegate to the core.
create or replace function public.create_order(
  p_shop_id         uuid,
  p_customer        jsonb,
  p_address         jsonb,
  p_items           jsonb,
  p_payment_method  public.payment_method,
  p_payment_status  public.payment_status default 'pending',
  p_shipping_total  numeric default 0,
  p_discount_total  numeric default 0,
  p_notes           text default null,
  p_confirm         boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop     public.shops;
  v_order_id uuid;
begin
  select * into v_shop from public.shops where id = p_shop_id;
  if v_shop.id is null or not private.can_access_shop(v_shop.organization_id, v_shop.id) then
    raise exception 'Shop not found' using errcode = 'no_data_found';
  end if;
  if not private.has_org_role(v_shop.organization_id, array['owner', 'admin', 'manager', 'staff']::public.org_role[]) then
    raise exception 'Not allowed to create orders' using errcode = '42501';
  end if;

  v_order_id := private.create_order_core(p_shop_id, p_customer, p_address, p_items, p_payment_method,
    p_payment_status, p_shipping_total, p_discount_total, p_notes, 'admin');
  if p_confirm then
    perform private.confirm_order_core(v_order_id);
  end if;
  return v_order_id;
end;
$$;

create or replace function public.confirm_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.authorize_order(p_order_id, array['owner', 'admin', 'manager', 'staff']::public.org_role[]);
  perform private.confirm_order_core(p_order_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Public catalogue
-- -----------------------------------------------------------------------------

-- A shop is visible when it's live, or to its own staff (preview).
create or replace function private.storefront_visible(p_shop public.shops)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_shop.id is not null and (
    p_shop.status = 'live'
    or (auth.uid() is not null and private.can_access_shop(p_shop.organization_id, p_shop.id))
  );
$$;

-- Units sellable from a shop: available stock in its active, linked warehouses.
create or replace function private.shop_available(p_shop_id uuid, p_variant_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(greatest(il.available, 0)), 0)::integer
  from public.shop_warehouses sw
  join public.warehouses w on w.id = sw.warehouse_id and w.is_active
  join public.inventory_levels il on il.warehouse_id = sw.warehouse_id and il.variant_id = p_variant_id
  where sw.shop_id = p_shop_id;
$$;

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
    'cod_limit', private.shop_setting_numeric(v_shop.settings, 'cod_limit')
  );
end;
$$;

-- Published, active products of a visible shop.
create or replace function private.storefront_products(p_shop_id uuid)
returns setof public.products
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.products p
  join public.shop_products sp on sp.product_id = p.id and sp.shop_id = p_shop_id and sp.is_published
  join public.shops s on s.id = p_shop_id
  where p.status = 'active' and private.storefront_visible(s);
$$;

create or replace function public.storefront_categories(p_shop_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'name', c.name, 'slug', c.slug, 'industry', c.industry,
           'group', coalesce(parent.name, c.name), 'count', x.n)
         order by coalesce(parent.sort_order, c.sort_order), coalesce(parent.name, c.name), c.sort_order, c.name), '[]'::jsonb)
  from (
    select p.category_id, count(*) as n from private.storefront_products(p_shop_id) p
    where p.category_id is not null group by p.category_id
  ) x
  join public.categories c on c.id = x.category_id
  left join public.categories parent on parent.id = c.parent_id;
$$;

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
        'min_price', min_price, 'max_price', max_price, 'compare_at', compare_at, 'in_stock', in_stock)) from page), '[]'::jsonb)
  );
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
               -- Exact stock isn't shared; anything above 10 reads as "in stock".
               'available', least(private.shop_available(p_shop_id, v.id), 10))
             order by v.price, v.created_at)
      from public.product_variants v where v.product_id = v_product.id and v.is_active), '[]'::jsonb)
  );
end;
$$;

-- Fresh price and stock for the variants in a cart.
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
           'gst_rate', coalesce(p.gst_rate, c.gst_rate, 0))), '[]'::jsonb)
  from private.storefront_products(p_shop_id) p
  join public.product_variants v on v.product_id = p.id and v.is_active
  left join public.categories c on c.id = p.category_id
  where v.id = any (p_variant_ids[1:100]);
$$;

-- The customer's view of an order, by its unguessable token.
create or replace function public.storefront_order(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'number', o.number,
    'placed_at', o.placed_at,
    'status', o.status,
    'payment_method', o.payment_method,
    'payment_status', o.payment_status,
    'fulfillment_status', o.fulfillment_status,
    'currency', o.currency,
    'subtotal', o.subtotal,
    'discount_total', o.discount_total,
    'shipping_total', o.shipping_total,
    'tax_total', o.tax_total,
    'grand_total', o.grand_total,
    'ship_to', jsonb_build_object('name', o.shipping_address ->> 'name', 'city', o.shipping_address ->> 'city',
                                  'state', o.shipping_address ->> 'state', 'postal_code', o.shipping_address ->> 'postal_code'),
    'shop', jsonb_build_object('name', s.name, 'slug', s.slug, 'support_email', s.settings ->> 'support_email',
                               'support_phone', s.settings ->> 'support_phone'),
    'items', coalesce((select jsonb_agg(jsonb_build_object('title', oi.title, 'quantity', oi.quantity,
                                                           'unit_price', oi.unit_price, 'total', oi.total) order by oi.created_at)
                       from public.order_items oi where oi.order_id = o.id), '[]'::jsonb),
    'shipments', coalesce((select jsonb_agg(jsonb_build_object('number', sh.number, 'status', sh.status,
                                                               'tracking_token', sh.tracking_token) order by sh.created_at)
                           from public.shipments sh where sh.order_id = o.id and sh.status <> 'cancelled'), '[]'::jsonb)
  )
  from public.orders o join public.shops s on s.id = o.shop_id
  where p_token ~ '^[0-9a-f]{32}$' and o.public_token = p_token;
$$;

-- -----------------------------------------------------------------------------
-- Checkout sessions (private: never exposed through the API)
-- -----------------------------------------------------------------------------
create table private.checkout_sessions (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references public.shops (id) on delete cascade,
  email           extensions.citext not null,
  contact         jsonb not null,
  address         jsonb not null,
  lines           jsonb not null,
  payment_method  public.payment_method not null,
  subtotal        numeric(12, 2) not null,
  shipping_total  numeric(12, 2) not null,
  grand_total     numeric(12, 2) not null,
  otp_hash        text,
  otp_expires_at  timestamptz,
  otp_attempts    integer not null default 0,
  otp_sends       integer not null default 0,
  last_sent_at    timestamptz,
  order_id        uuid references public.orders (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index checkout_sessions_rate_idx on private.checkout_sessions (shop_id, email, created_at desc);

create or replace function private.new_otp()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_rand bytea := extensions.gen_random_bytes(4);
begin
  return lpad((((get_byte(v_rand, 0)::bigint << 24) | (get_byte(v_rand, 1) << 16)
                | (get_byte(v_rand, 2) << 8) | get_byte(v_rand, 3)) % 1000000)::text, 6, '0');
end;
$$;

-- Start a checkout: re-price the cart from the database, check stock and the
-- shop's limits, and issue an email code. Returns the plain code (server only).
create or replace function public.storefront_checkout_start(
  p_shop_id        uuid,
  p_lines          jsonb,
  p_contact        jsonb,
  p_address        jsonb,
  p_payment_method public.payment_method default 'cod'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_shop      public.shops;
  v_email     text := nullif(lower(btrim(p_contact ->> 'email')), '');
  v_line      jsonb;
  v_variant   record;
  v_qty       integer;
  v_avail     integer;
  v_lines     jsonb := '[]'::jsonb;
  v_subtotal  numeric := 0;
  v_fee       numeric;
  v_free_over numeric;
  v_cod_limit numeric;
  v_shipping  numeric;
  v_id        uuid;
  v_otp       text := private.new_otp();
begin
  select * into v_shop from public.shops where id = p_shop_id;
  if v_shop.id is null or v_shop.status <> 'live' then
    raise exception 'This shop is not taking orders right now' using errcode = 'check_violation';
  end if;
  if p_payment_method <> 'cod' then
    raise exception 'Only cash on delivery is available at the moment' using errcode = 'check_violation';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Your cart is empty' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_lines) > 50 then
    raise exception 'A cart can hold at most 50 different items' using errcode = 'check_violation';
  end if;
  if (select count(*) from private.checkout_sessions
      where shop_id = p_shop_id and email = v_email::extensions.citext
        and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many checkout attempts. Please try again in a little while.' using errcode = 'check_violation';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line ->> 'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 20 then
      raise exception 'You can order 1 to 20 of each item' using errcode = 'check_violation';
    end if;

    select v.id, v.price, v.title, p.title as product_title into v_variant
    from private.storefront_products(p_shop_id) p
    join public.product_variants v on v.product_id = p.id and v.is_active
    where v.id = (v_line ->> 'variant_id')::uuid;
    if v_variant.id is null then
      raise exception 'An item in your cart is no longer available' using errcode = 'check_violation';
    end if;

    v_avail := private.shop_available(p_shop_id, v_variant.id);
    if v_avail < v_qty then
      raise exception 'Only % left of %', v_avail,
        v_variant.product_title || case when v_variant.title <> 'Default' then ' (' || v_variant.title || ')' else '' end
        using errcode = 'check_violation';
    end if;

    v_lines := v_lines || jsonb_build_object('variant_id', v_variant.id, 'quantity', v_qty, 'unit_price', v_variant.price);
    v_subtotal := v_subtotal + v_qty * v_variant.price;
  end loop;

  v_fee := coalesce(private.shop_setting_numeric(v_shop.settings, 'shipping_fee'), 0);
  v_free_over := private.shop_setting_numeric(v_shop.settings, 'free_shipping_over');
  v_shipping := case when v_free_over is not null and v_subtotal >= v_free_over then 0 else v_fee end;

  v_cod_limit := private.shop_setting_numeric(v_shop.settings, 'cod_limit');
  if v_cod_limit is not null and v_subtotal + v_shipping > v_cod_limit then
    raise exception 'Cash on delivery is available for orders up to %', v_cod_limit using errcode = 'check_violation';
  end if;

  insert into private.checkout_sessions (
    shop_id, email, contact, address, lines, payment_method, subtotal, shipping_total, grand_total,
    otp_hash, otp_expires_at, otp_sends, last_sent_at
  ) values (
    p_shop_id, v_email, p_contact, p_address, v_lines, p_payment_method, v_subtotal, v_shipping,
    v_subtotal + v_shipping, extensions.crypt(v_otp, extensions.gen_salt('bf', 8)),
    now() + interval '10 minutes', 1, now()
  )
  returning id into v_id;

  return jsonb_build_object('checkout_id', v_id, 'otp', v_otp, 'email', v_email,
    'subtotal', v_subtotal, 'shipping_total', v_shipping, 'grand_total', v_subtotal + v_shipping);
end;
$$;

create or replace function public.storefront_checkout_resend(p_checkout_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session private.checkout_sessions;
  v_otp     text := private.new_otp();
begin
  select * into v_session from private.checkout_sessions where id = p_checkout_id for update;
  if v_session.id is null or v_session.order_id is not null or v_session.created_at < now() - interval '1 hour' then
    raise exception 'This checkout has expired. Please start again.' using errcode = 'check_violation';
  end if;
  if v_session.otp_sends >= 3 then
    raise exception 'We''ve sent the code three times. Please start the checkout again.' using errcode = 'check_violation';
  end if;
  if v_session.last_sent_at > now() - interval '30 seconds' then
    raise exception 'Please wait a few seconds before asking for another code' using errcode = 'check_violation';
  end if;

  update private.checkout_sessions
  set otp_hash = extensions.crypt(v_otp, extensions.gen_salt('bf', 8)),
      otp_expires_at = now() + interval '10 minutes',
      otp_attempts = 0,
      otp_sends = otp_sends + 1,
      last_sent_at = now()
  where id = p_checkout_id;

  return jsonb_build_object('otp', v_otp, 'email', v_session.email::text, 'sends_left', 3 - v_session.otp_sends - 1);
end;
$$;

-- Verify the code and place the order (reserving stock). Wrong codes are
-- counted without raising so the count persists; 5 misses end the session.
create or replace function public.storefront_checkout_confirm(p_checkout_id uuid, p_otp text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session  private.checkout_sessions;
  v_order_id uuid;
  v_order    public.orders;
  c_max      constant integer := 5;
begin
  select * into v_session from private.checkout_sessions where id = p_checkout_id for update;
  if v_session.id is null then
    return jsonb_build_object('ok', false, 'message', 'This checkout has expired. Please start again.');
  end if;
  if v_session.order_id is not null then
    select * into v_order from public.orders where id = v_session.order_id;
    return jsonb_build_object('ok', true, 'order_id', v_order.id, 'order_number', v_order.number,
      'public_token', v_order.public_token, 'grand_total', v_order.grand_total);
  end if;
  if v_session.otp_expires_at < now() then
    return jsonb_build_object('ok', false, 'expired', true, 'message', 'The code has expired. Ask for a new one.');
  end if;
  if v_session.otp_attempts >= c_max then
    return jsonb_build_object('ok', false, 'locked', true, 'message', 'Too many wrong codes. Ask for a new one.');
  end if;
  if p_otp is null or p_otp !~ '^[0-9]{6}$' or extensions.crypt(p_otp, v_session.otp_hash) <> v_session.otp_hash then
    update private.checkout_sessions set otp_attempts = otp_attempts + 1 where id = p_checkout_id;
    return jsonb_build_object('ok', false, 'attempts_left', c_max - v_session.otp_attempts - 1,
      'message', 'That code is not right');
  end if;

  v_order_id := private.create_order_core(
    v_session.shop_id,
    jsonb_build_object('full_name', v_session.contact ->> 'name', 'email', v_session.email::text,
                       'phone', v_session.contact ->> 'phone'),
    v_session.address,
    v_session.lines,
    v_session.payment_method,
    'pending',
    v_session.shipping_total,
    0,
    v_session.contact ->> 'note',
    'storefront');

  perform private.add_order_event((select organization_id from public.shops where id = v_session.shop_id),
    v_order_id, 'customer.verified', 'Customer verified their email (' || v_session.email::text || ')');
  -- Reserve stock straight away; if someone else bought the last unit in the
  -- meantime this raises and nothing is saved.
  perform private.confirm_order_core(v_order_id);

  update private.checkout_sessions set order_id = v_order_id, otp_hash = null where id = p_checkout_id;
  update public.customers set email_verified_at = coalesce(email_verified_at, now())
  where id = (select customer_id from public.orders where id = v_order_id);

  select * into v_order from public.orders where id = v_order_id;
  return jsonb_build_object('ok', true, 'order_id', v_order.id, 'order_number', v_order.number,
    'public_token', v_order.public_token, 'grand_total', v_order.grand_total);
end;
$$;

-- -----------------------------------------------------------------------------
-- Customers overview (admin)
-- -----------------------------------------------------------------------------
create view public.customer_overview
with (security_invoker = true) as
select
  c.id,
  c.organization_id,
  c.full_name,
  c.email::text as email,
  c.phone,
  c.email_verified_at,
  c.accepts_marketing,
  c.tags,
  c.created_at,
  coalesce(s.orders, 0) as orders_count,
  coalesce(s.spent, 0) as total_spent,
  s.last_order_at,
  lower(coalesce(c.full_name, '') || ' ' || coalesce(c.email::text, '') || ' ' || coalesce(c.phone, '')) as search_text
from public.customers c
left join lateral (
  select count(*) filter (where o.status <> 'cancelled') as orders,
         sum(o.grand_total) filter (where o.status <> 'cancelled') as spent,
         max(o.placed_at) as last_order_at
  from public.orders o where o.customer_id = c.id
) s on true;

revoke all on public.customer_overview from anon;
grant select on public.customer_overview to authenticated;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function private.create_order_core(uuid, jsonb, jsonb, jsonb, public.payment_method, public.payment_status, numeric, numeric, text, text) from public;
revoke all on function private.confirm_order_core(uuid) from public;

revoke all on function public.storefront_shop(text) from public;
revoke all on function public.storefront_categories(uuid) from public;
revoke all on function public.storefront_catalog(uuid, uuid, text, text, integer, integer) from public;
revoke all on function public.storefront_product(uuid, text) from public;
revoke all on function public.storefront_variants(uuid, uuid[]) from public;
revoke all on function public.storefront_order(text) from public;
grant execute on function public.storefront_shop(text) to anon, authenticated;
grant execute on function public.storefront_categories(uuid) to anon, authenticated;
grant execute on function public.storefront_catalog(uuid, uuid, text, text, integer, integer) to anon, authenticated;
grant execute on function public.storefront_product(uuid, text) to anon, authenticated;
grant execute on function public.storefront_variants(uuid, uuid[]) to anon, authenticated;
grant execute on function public.storefront_order(text) to anon, authenticated;

-- Checkout returns plain OTPs: only the server's service role may call it.
revoke all on function public.storefront_checkout_start(uuid, jsonb, jsonb, jsonb, public.payment_method) from public, anon, authenticated;
revoke all on function public.storefront_checkout_resend(uuid) from public, anon, authenticated;
revoke all on function public.storefront_checkout_confirm(uuid, text) from public, anon, authenticated;
grant execute on function public.storefront_checkout_start(uuid, jsonb, jsonb, jsonb, public.payment_method) to service_role;
grant execute on function public.storefront_checkout_resend(uuid) to service_role;
grant execute on function public.storefront_checkout_confirm(uuid, text) to service_role;
