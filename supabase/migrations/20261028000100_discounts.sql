-- =============================================================================
-- Shopverse · Migration 019 · Discounts and promotions
--
--  * public.discounts: codes shoppers type in, or automatic offers (no code).
--    Percentage (optionally capped), fixed amount, or free delivery; minimum
--    order, validity window, overall and per-customer limits, first order
--    only, and which shops. One discount per order: a valid code, otherwise
--    the best automatic offer.
--  * Discounts are priced in the database at checkout, and a redemption is
--    recorded when the order is placed, re-checking the limits under a lock.
--  * An order's discount is spread across its lines (order_items.discount_amount)
--    so each line's GST is on what was actually charged; invoices stay exact.
--    This applies to staff-entered discounts too.
--  * Shops can show an announcement bar.
-- =============================================================================

create table public.discounts (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  -- Null for automatic offers.
  code               extensions.citext,
  title              text not null check (char_length(btrim(title)) between 2 and 80),
  kind               text not null check (kind in ('percent', 'fixed', 'free_shipping')),
  value              numeric(12, 2) not null default 0,
  min_subtotal       numeric(12, 2) check (min_subtotal is null or min_subtotal >= 0),
  max_discount       numeric(12, 2) check (max_discount is null or max_discount > 0),
  starts_at          timestamptz not null default now(),
  ends_at            timestamptz,
  usage_limit        integer check (usage_limit is null or usage_limit > 0),
  per_customer_limit integer check (per_customer_limit is null or per_customer_limit > 0),
  first_order_only   boolean not null default false,
  -- Null: every shop of the organisation.
  shop_ids           uuid[] check (shop_ids is null or cardinality(shop_ids) between 1 and 100),
  is_active          boolean not null default true,
  created_by         uuid references auth.users (id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint discounts_code_format check (code is null or code::text ~ '^[A-Za-z0-9_-]{3,32}$'),
  constraint discounts_value_range check (
    (kind = 'percent' and value > 0 and value <= 100)
    or (kind = 'fixed' and value > 0)
    or (kind = 'free_shipping' and value = 0)),
  constraint discounts_window check (ends_at is null or ends_at > starts_at),
  unique (organization_id, id)
);

create unique index discounts_org_code_uidx on public.discounts (organization_id, code) where code is not null;
create index discounts_org_active_idx on public.discounts (organization_id, is_active, starts_at);

create trigger discounts_set_updated_at
  before update on public.discounts
  for each row execute function private.set_updated_at();

create trigger discounts_audit
  after insert or update or delete on public.discounts
  for each row execute function private.audit_row_change('discount');

-- Shops named on a discount must belong to its organisation.
create or replace function private.discount_shops_valid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.shop_ids is not null and exists (
    select 1 from unnest(new.shop_ids) s(id)
    where not exists (select 1 from public.shops where id = s.id and organization_id = new.organization_id)
  ) then
    raise exception 'Choose shops from this business' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger discounts_shops_valid
  before insert or update of shop_ids on public.discounts
  for each row execute function private.discount_shops_valid();

create table public.discount_redemptions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  discount_id     uuid not null,
  order_id        uuid not null unique,
  customer_id     uuid,
  amount          numeric(12, 2) not null check (amount >= 0),
  created_at      timestamptz not null default now(),
  -- A used discount can be switched off, not deleted (orders point at it).
  foreign key (organization_id, discount_id) references public.discounts (organization_id, id) on delete restrict,
  foreign key (organization_id, order_id) references public.orders (organization_id, id) on delete cascade
);

create index discount_redemptions_discount_idx on public.discount_redemptions (discount_id, customer_id);

alter table public.orders
  add column discount_id   uuid,
  add column discount_code text,
  add constraint orders_discount_fk foreign key (organization_id, discount_id)
    references public.discounts (organization_id, id) on delete restrict;

alter table public.order_items
  add column discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0);

alter table private.checkout_sessions
  add column discount_total numeric(12, 2) not null default 0,
  add column discount_id    uuid,
  add column discount_code  text,
  add column discount_saved numeric(12, 2) not null default 0;

alter table public.discounts enable row level security;
alter table public.discount_redemptions enable row level security;

create policy "discounts: members read" on public.discounts
  for select to authenticated using (private.is_org_member(organization_id));
create policy "discounts: managers write" on public.discounts
  for all to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]));
create policy "discount redemptions: members read" on public.discount_redemptions
  for select to authenticated using (private.is_org_member(organization_id));

revoke all on public.discounts from anon;
revoke all on public.discount_redemptions from anon;
revoke insert, update, delete, truncate on public.discount_redemptions from authenticated;

-- Staff view with usage.
create view public.discount_overview
with (security_invoker = true) as
select
  d.*,
  coalesce(u.uses, 0) as uses,
  coalesce(u.saved, 0) as total_saved,
  case
    when not d.is_active then 'inactive'
    when d.ends_at is not null and d.ends_at <= now() then 'expired'
    when d.starts_at > now() then 'scheduled'
    when d.usage_limit is not null and coalesce(u.uses, 0) >= d.usage_limit then 'used_up'
    else 'active'
  end as state
from public.discounts d
left join lateral (
  select count(*) as uses, sum(r.amount) as saved
  from public.discount_redemptions r
  join public.orders o on o.id = r.order_id and o.status <> 'cancelled'
  where r.discount_id = d.id
) u on true;

revoke all on public.discount_overview from anon;
grant select on public.discount_overview to authenticated;

-- -----------------------------------------------------------------------------
-- Evaluating a discount
-- -----------------------------------------------------------------------------

-- Uses that count against limits: redemptions of orders that weren't cancelled.
create or replace function private.discount_uses(p_discount_id uuid, p_customer_id uuid default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.discount_redemptions r
  join public.orders o on o.id = r.order_id and o.status <> 'cancelled'
  where r.discount_id = p_discount_id
    and (p_customer_id is null or r.customer_id = p_customer_id);
$$;

-- Whether a discount applies, and what it saves. Never raises:
-- { ok, amount (off items), free_shipping, saved, message? }
create or replace function private.evaluate_discount(
  p_discount public.discounts,
  p_shop_id  uuid,
  p_subtotal numeric,
  p_shipping numeric,
  p_email    text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_amount      numeric := 0;
  v_currency    text;
begin
  if p_discount.id is null or not p_discount.is_active
     or (p_discount.shop_ids is not null and not (p_shop_id = any (p_discount.shop_ids))) then
    return jsonb_build_object('ok', false, 'message', 'This code isn''t valid');
  end if;
  if p_discount.starts_at > now() then
    return jsonb_build_object('ok', false, 'message', 'This code isn''t active yet');
  end if;
  if p_discount.ends_at is not null and p_discount.ends_at <= now() then
    return jsonb_build_object('ok', false, 'message', 'This code has expired');
  end if;
  select currency into v_currency from public.shops where id = p_shop_id;
  if p_discount.min_subtotal is not null and p_subtotal < p_discount.min_subtotal then
    return jsonb_build_object('ok', false, 'message',
      'Add ' || to_char(p_discount.min_subtotal - p_subtotal, 'FM999G999G990D00') || ' ' || v_currency
      || ' more to use this code');
  end if;
  if p_discount.usage_limit is not null and private.discount_uses(p_discount.id) >= p_discount.usage_limit then
    return jsonb_build_object('ok', false, 'message', 'This code has been fully used');
  end if;

  if p_email is not null then
    select id into v_customer_id from public.customers
    where organization_id = p_discount.organization_id and lower(email::text) = lower(btrim(p_email));
  end if;
  if p_discount.first_order_only and v_customer_id is not null and exists (
    select 1 from public.orders where customer_id = v_customer_id and status <> 'cancelled'
  ) then
    return jsonb_build_object('ok', false, 'message', 'This code is for first orders only');
  end if;
  if p_discount.per_customer_limit is not null and v_customer_id is not null
     and private.discount_uses(p_discount.id, v_customer_id) >= p_discount.per_customer_limit then
    return jsonb_build_object('ok', false, 'message', 'You''ve already used this code');
  end if;

  if p_discount.kind = 'free_shipping' then
    return jsonb_build_object('ok', true, 'amount', 0, 'free_shipping', true, 'saved', p_shipping);
  end if;
  v_amount := case p_discount.kind
    when 'percent' then round(p_subtotal * p_discount.value / 100, 2)
    else p_discount.value
  end;
  if p_discount.max_discount is not null then
    v_amount := least(v_amount, p_discount.max_discount);
  end if;
  v_amount := least(v_amount, p_subtotal);
  return jsonb_build_object('ok', true, 'amount', v_amount, 'free_shipping', false, 'saved', v_amount);
end;
$$;

-- The discount for a cart: the code if one is given (or its error), otherwise
-- the automatic offer that saves the most. Never raises.
-- { discount: {id, code, title, kind} | null, amount, free_shipping, saved, error? }
create or replace function private.choose_discount(
  p_shop     public.shops,
  p_subtotal numeric,
  p_shipping numeric,
  p_code     text,
  p_email    text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_discount public.discounts;
  v_eval     jsonb;
  v_best     jsonb;
  v_best_d   public.discounts;
  v_code     text := nullif(btrim(p_code), '');
begin
  if v_code is not null then
    select * into v_discount from public.discounts
    where organization_id = p_shop.organization_id and lower(code::text) = lower(v_code);
    v_eval := private.evaluate_discount(v_discount, p_shop.id, p_subtotal, p_shipping, p_email);
    if not (v_eval ->> 'ok')::boolean then
      return jsonb_build_object('discount', null, 'amount', 0, 'free_shipping', false, 'saved', 0,
                                'error', v_eval ->> 'message');
    end if;
    return v_eval || jsonb_build_object('discount', jsonb_build_object(
      'id', v_discount.id, 'code', v_discount.code::text, 'title', v_discount.title, 'kind', v_discount.kind));
  end if;

  for v_discount in
    select * from public.discounts
    where organization_id = p_shop.organization_id and code is null and is_active
      and starts_at <= now() and (ends_at is null or ends_at > now())
  loop
    v_eval := private.evaluate_discount(v_discount, p_shop.id, p_subtotal, p_shipping, p_email);
    if (v_eval ->> 'ok')::boolean and (v_eval ->> 'saved')::numeric > 0
       and (v_best is null or (v_eval ->> 'saved')::numeric > (v_best ->> 'saved')::numeric) then
      v_best := v_eval;
      v_best_d := v_discount;
    end if;
  end loop;
  if v_best is null then
    return jsonb_build_object('discount', null, 'amount', 0, 'free_shipping', false, 'saved', 0);
  end if;
  return v_best || jsonb_build_object('discount', jsonb_build_object(
    'id', v_best_d.id, 'code', null, 'title', v_best_d.title, 'kind', v_best_d.kind));
end;
$$;

-- Record that an order used a discount, re-checking limits under a lock so two
-- simultaneous checkouts can't both take the last use.
create or replace function private.redeem_discount(p_order_id uuid, p_discount_id uuid, p_code text, p_saved numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_discount public.discounts;
  v_order    public.orders;
begin
  if p_discount_id is null then
    return;
  end if;
  select * into v_discount from public.discounts where id = p_discount_id for update;
  select * into v_order from public.orders where id = p_order_id;
  if not v_discount.is_active or (v_discount.ends_at is not null and v_discount.ends_at <= now()) then
    raise exception 'This discount has just ended. Please review your order.' using errcode = 'check_violation';
  end if;
  if v_discount.usage_limit is not null and private.discount_uses(v_discount.id) >= v_discount.usage_limit then
    raise exception 'This code has just been fully used. Please review your order.' using errcode = 'check_violation';
  end if;
  if v_discount.per_customer_limit is not null and v_order.customer_id is not null
     and private.discount_uses(v_discount.id, v_order.customer_id) >= v_discount.per_customer_limit then
    raise exception 'You''ve already used this code' using errcode = 'check_violation';
  end if;

  insert into public.discount_redemptions (organization_id, discount_id, order_id, customer_id, amount)
  values (v_order.organization_id, v_discount.id, p_order_id, v_order.customer_id, round(p_saved, 2));
  update public.orders set discount_id = v_discount.id, discount_code = nullif(p_code, '') where id = p_order_id;
  perform private.add_order_event(v_order.organization_id, p_order_id, 'discount.applied',
    coalesce('Code ' || nullif(p_code, '') || ': ', 'Offer: ') || v_discount.title
      || ' (saved ' || round(p_saved, 2) || ' ' || v_order.currency || ')');
end;
$$;

-- Spread an order-level discount over its lines, in proportion to their value,
-- and recompute each line's GST on what's actually charged.
create or replace function private.allocate_discount(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order     public.orders;
  v_item      record;
  v_left      numeric;
  v_share     numeric;
  v_remaining integer;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  v_left := least(v_order.discount_total, v_order.subtotal);
  select count(*) into v_remaining from public.order_items where order_id = p_order_id;

  for v_item in
    select id, total, gst_rate from public.order_items where order_id = p_order_id order by total desc, created_at, id
  loop
    v_share := case when v_remaining = 1 or v_order.subtotal = 0 then v_left
                    else least(v_left, round(v_order.discount_total * v_item.total / v_order.subtotal, 2)) end;
    v_share := least(v_share, v_item.total);
    update public.order_items
    set discount_amount = v_share,
        tax_amount = round((total - v_share) * gst_rate / (100 + gst_rate), 2)
    where id = v_item.id;
    v_left := v_left - v_share;
    v_remaining := v_remaining - 1;
  end loop;

  update public.orders
  set tax_total = (select coalesce(sum(tax_amount), 0) from public.order_items where order_id = p_order_id)
  where id = p_order_id;
end;
$$;

-- Every order with a discount gets it spread over its lines (staff orders too).
create or replace function private.orders_allocate_discount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.discount_total > 0 and (old.discount_total is distinct from new.discount_total
                                  or old.subtotal is distinct from new.subtotal) then
    perform private.allocate_discount(new.id);
  end if;
  return new;
end;
$$;

create trigger orders_allocate_discount
  after update of subtotal, discount_total on public.orders
  for each row execute function private.orders_allocate_discount();

-- -----------------------------------------------------------------------------
-- Checkout pricing with discounts
-- -----------------------------------------------------------------------------
drop function private.price_checkout(public.shops, jsonb, text);

create or replace function private.price_checkout(
  p_shop   public.shops,
  p_lines  jsonb,
  p_method text,
  p_code   text default null,
  p_email  text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
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
  v_discount  jsonb;
  v_total     numeric;
begin
  if p_method not in ('cod', 'online') then
    raise exception 'Choose how you''d like to pay' using errcode = 'check_violation';
  end if;
  if not private.shop_accepts(p_shop, p_method) then
    raise exception '%', case p_method when 'cod' then 'Cash on delivery isn''t available at this shop'
                                       else 'Online payment isn''t available at this shop' end
      using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Your cart is empty' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_lines) > 50 then
    raise exception 'A cart can hold at most 50 different items' using errcode = 'check_violation';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line ->> 'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 20 then
      raise exception 'You can order 1 to 20 of each item' using errcode = 'check_violation';
    end if;

    select v.id, v.price, v.title, p.title as product_title into v_variant
    from private.storefront_products(p_shop.id) p
    join public.product_variants v on v.product_id = p.id and v.is_active
    where v.id = (v_line ->> 'variant_id')::uuid;
    if v_variant.id is null then
      raise exception 'An item in your cart is no longer available' using errcode = 'check_violation';
    end if;

    v_avail := private.shop_available(p_shop.id, v_variant.id);
    if v_avail < v_qty then
      raise exception 'Only % left of %', v_avail,
        v_variant.product_title || case when v_variant.title <> 'Default' then ' (' || v_variant.title || ')' else '' end
        using errcode = 'check_violation';
    end if;

    v_lines := v_lines || jsonb_build_object('variant_id', v_variant.id, 'quantity', v_qty, 'unit_price', v_variant.price);
    v_subtotal := v_subtotal + v_qty * v_variant.price;
  end loop;

  v_fee := coalesce(private.shop_setting_numeric(p_shop.settings, 'shipping_fee'), 0);
  v_free_over := private.shop_setting_numeric(p_shop.settings, 'free_shipping_over');
  v_shipping := case when v_free_over is not null and v_subtotal >= v_free_over then 0 else v_fee end;

  v_discount := private.choose_discount(p_shop, v_subtotal, v_shipping, p_code, p_email);
  if v_discount ? 'error' then
    raise exception '%', v_discount ->> 'error' using errcode = 'check_violation';
  end if;
  if (v_discount ->> 'free_shipping')::boolean then
    v_shipping := 0;
  end if;
  v_total := v_subtotal - (v_discount ->> 'amount')::numeric + v_shipping;

  v_cod_limit := private.shop_setting_numeric(p_shop.settings, 'cod_limit');
  if p_method = 'cod' and v_cod_limit is not null and v_total > v_cod_limit then
    raise exception 'Cash on delivery is available for orders up to %. Please pay online.', v_cod_limit
      using errcode = 'check_violation';
  end if;

  return jsonb_build_object('lines', v_lines, 'subtotal', v_subtotal, 'shipping_total', v_shipping,
                            'discount_total', (v_discount ->> 'amount')::numeric,
                            'discount', v_discount -> 'discount', 'discount_saved', (v_discount ->> 'saved')::numeric,
                            'grand_total', v_total);
end;
$$;

-- Cart and checkout summaries: prices from the database, the discount that
-- would apply (or why a code can't), never raising. Server only.
create or replace function public.storefront_quote(p_shop_id uuid, p_lines jsonb, p_code text default null, p_email text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_shop      public.shops;
  v_subtotal  numeric;
  v_fee       numeric;
  v_free_over numeric;
  v_shipping  numeric;
  v_discount  jsonb;
begin
  select * into v_shop from public.shops where id = p_shop_id;
  if v_shop.id is null then
    return null;
  end if;
  select coalesce(sum(v.price * (l ->> 'quantity')::integer), 0) into v_subtotal
  from jsonb_array_elements(case when jsonb_typeof(p_lines) = 'array' then p_lines else '[]'::jsonb end) l
  join private.storefront_products(p_shop_id) p on true
  join public.product_variants v on v.product_id = p.id and v.is_active and v.id = (l ->> 'variant_id')::uuid;

  v_fee := coalesce(private.shop_setting_numeric(v_shop.settings, 'shipping_fee'), 0);
  v_free_over := private.shop_setting_numeric(v_shop.settings, 'free_shipping_over');
  v_shipping := case when v_free_over is not null and v_subtotal >= v_free_over then 0 else v_fee end;
  v_discount := private.choose_discount(v_shop, v_subtotal, v_shipping, p_code, p_email);
  if (v_discount ->> 'free_shipping')::boolean then
    v_shipping := 0;
  end if;

  return jsonb_build_object(
    'subtotal', v_subtotal,
    'shipping_total', v_shipping,
    'discount_total', (v_discount ->> 'amount')::numeric,
    'grand_total', v_subtotal - (v_discount ->> 'amount')::numeric + v_shipping,
    'discount', v_discount -> 'discount',
    'saved', (v_discount ->> 'saved')::numeric,
    'error', v_discount ->> 'error');
end;
$$;

-- Guest checkout start, with an optional code.
drop function public.storefront_checkout_start(uuid, jsonb, jsonb, jsonb, public.payment_method);

create or replace function public.storefront_checkout_start(
  p_shop_id        uuid,
  p_lines          jsonb,
  p_contact        jsonb,
  p_address        jsonb,
  p_payment_method public.payment_method default 'cod',
  p_discount_code  text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_shop  public.shops;
  v_email text := nullif(lower(btrim(p_contact ->> 'email')), '');
  v_price jsonb;
  v_id    uuid;
  v_otp   text := private.new_otp();
begin
  select * into v_shop from public.shops where id = p_shop_id;
  if v_shop.id is null or v_shop.status <> 'live' then
    raise exception 'This shop is not taking orders right now' using errcode = 'check_violation';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address' using errcode = 'check_violation';
  end if;
  if (select count(*) from private.checkout_sessions
      where shop_id = p_shop_id and email = v_email::extensions.citext
        and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many checkout attempts. Please try again in a little while.' using errcode = 'check_violation';
  end if;

  v_price := private.price_checkout(v_shop, p_lines, p_payment_method::text, p_discount_code, v_email);

  insert into private.checkout_sessions (
    shop_id, email, contact, address, lines, payment_method, subtotal, shipping_total, grand_total,
    discount_total, discount_id, discount_code, discount_saved,
    otp_hash, otp_expires_at, otp_sends, last_sent_at
  ) values (
    p_shop_id, v_email, p_contact, p_address, v_price -> 'lines', p_payment_method,
    (v_price ->> 'subtotal')::numeric, (v_price ->> 'shipping_total')::numeric, (v_price ->> 'grand_total')::numeric,
    (v_price ->> 'discount_total')::numeric, (v_price -> 'discount' ->> 'id')::uuid, v_price -> 'discount' ->> 'code',
    (v_price ->> 'discount_saved')::numeric,
    extensions.crypt(v_otp, extensions.gen_salt('bf', 8)), now() + interval '10 minutes', 1, now()
  )
  returning id into v_id;

  return jsonb_build_object('checkout_id', v_id, 'otp', v_otp, 'email', v_email,
    'subtotal', v_price -> 'subtotal', 'shipping_total', v_price -> 'shipping_total',
    'discount_total', v_price -> 'discount_total', 'grand_total', v_price -> 'grand_total');
end;
$$;

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
  if v_session.order_id is null then
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
      v_session.address, v_session.lines, v_session.payment_method, 'pending',
      v_session.shipping_total, v_session.discount_total, v_session.contact ->> 'note', 'storefront');
    perform private.redeem_discount(v_order_id, v_session.discount_id, v_session.discount_code, v_session.discount_saved);

    perform private.add_order_event((select organization_id from public.shops where id = v_session.shop_id),
      v_order_id, 'customer.verified', 'Customer verified their email (' || v_session.email::text || ')');
    if v_session.payment_method = 'online' then
      perform private.hold_for_payment(v_order_id);
    else
      perform private.confirm_order_core(v_order_id);
    end if;

    update private.checkout_sessions set order_id = v_order_id, otp_hash = null where id = p_checkout_id;
    update public.customers set email_verified_at = coalesce(email_verified_at, now())
    where id = (select customer_id from public.orders where id = v_order_id);
  end if;

  select * into v_order from public.orders where id = coalesce(v_order_id, v_session.order_id);
  return jsonb_build_object('ok', true, 'order_id', v_order.id, 'order_number', v_order.number,
    'public_token', v_order.public_token, 'grand_total', v_order.grand_total,
    'awaiting_payment', v_order.payment_due_at is not null and v_order.payment_status <> 'paid'
                        and v_order.status = 'pending');
end;
$$;

-- Signed-in checkout, with an optional code.
drop function public.shopper_checkout(uuid, text, uuid, jsonb, jsonb, jsonb, public.payment_method, boolean);

create or replace function public.shopper_checkout(
  p_shop_id        uuid,
  p_token          text,
  p_request_id     uuid,
  p_lines          jsonb,
  p_contact        jsonb,
  p_address        jsonb,
  p_payment_method public.payment_method default 'cod',
  p_save_address   boolean default false,
  p_discount_code  text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_customer public.customers := private.require_shopper(p_shop_id, p_token);
  v_shop     public.shops;
  v_price    jsonb;
  v_order_id uuid;
  v_order    public.orders;
begin
  select order_id into v_order_id from private.shopper_checkouts
  where request_id = p_request_id and customer_id = v_customer.id;

  if v_order_id is null then
    select * into v_shop from public.shops where id = p_shop_id;
    if v_shop.status <> 'live' then
      raise exception 'This shop is not taking orders right now' using errcode = 'check_violation';
    end if;
    if (select count(*) from public.orders
        where customer_id = v_customer.id and source = 'storefront' and placed_at > now() - interval '1 hour') >= 10 then
      raise exception 'You''ve placed a lot of orders in the last hour. Please try again later.' using errcode = 'check_violation';
    end if;

    v_price := private.price_checkout(v_shop, p_lines, p_payment_method::text, p_discount_code, v_customer.email::text);

    v_order_id := private.create_order_core(
      p_shop_id,
      jsonb_build_object('full_name', p_contact ->> 'name', 'email', v_customer.email::text, 'phone', p_contact ->> 'phone'),
      p_address, v_price -> 'lines', p_payment_method, 'pending',
      (v_price ->> 'shipping_total')::numeric, (v_price ->> 'discount_total')::numeric, p_contact ->> 'note', 'storefront');
    perform private.redeem_discount(v_order_id, (v_price -> 'discount' ->> 'id')::uuid,
                                    v_price -> 'discount' ->> 'code', (v_price ->> 'discount_saved')::numeric);

    perform private.add_order_event(v_shop.organization_id, v_order_id, 'customer.verified',
      'Placed while signed in as ' || v_customer.email::text);
    if p_payment_method = 'online' then
      perform private.hold_for_payment(v_order_id);
    else
      perform private.confirm_order_core(v_order_id);
    end if;

    insert into private.shopper_checkouts (request_id, customer_id, order_id)
    values (p_request_id, v_customer.id, v_order_id);

    if p_save_address and not exists (
      select 1 from public.customer_addresses
      where customer_id = v_customer.id
        and lower(line1) = lower(btrim(p_address ->> 'line1'))
        and postal_code = btrim(p_address ->> 'postal_code')
    ) and (select count(*) from public.customer_addresses where customer_id = v_customer.id) < 10 then
      perform public.shopper_save_address(p_shop_id, p_token, p_address, null);
    end if;
  end if;

  select * into v_order from public.orders where id = v_order_id;
  return jsonb_build_object('order_id', v_order.id, 'order_number', v_order.number,
    'public_token', v_order.public_token, 'grand_total', v_order.grand_total,
    'awaiting_payment', v_order.payment_due_at is not null and v_order.payment_status <> 'paid'
                        and v_order.status = 'pending');
end;
$$;

-- -----------------------------------------------------------------------------
-- Invoices and the customer's order page show the discount
-- -----------------------------------------------------------------------------
create or replace function private.invoice_json(p_order public.orders, p_full_buyer boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_order.invoice_number is null then null else jsonb_build_object(
    'number', p_order.invoice_number,
    'issued_at', p_order.invoiced_at,
    'order_number', p_order.number,
    'placed_at', p_order.placed_at,
    'payment_method', p_order.payment_method,
    'payment_status', p_order.payment_status,
    'currency', p_order.currency,
    'seller', p_order.invoice_details -> 'seller',
    'buyer', case when p_full_buyer then p_order.invoice_details -> 'buyer'
                  else (p_order.invoice_details -> 'buyer') - 'phone' - 'line1' - 'line2' end,
    'subtotal', p_order.subtotal,
    'discount_total', p_order.discount_total,
    'discount_code', p_order.discount_code,
    'shipping_total', p_order.shipping_total,
    'grand_total', p_order.grand_total,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
               'title', oi.title, 'sku', oi.sku, 'hsn_code', oi.hsn_code, 'quantity', oi.quantity,
               'unit_price', oi.unit_price, 'total', oi.total, 'discount_amount', oi.discount_amount,
               'gst_rate', oi.gst_rate, 'tax_amount', oi.tax_amount)
             order by oi.created_at)
             from public.order_items oi where oi.order_id = p_order.id), '[]'::jsonb)
  ) end;
$$;

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
    'stage', private.order_stage(o),
    'invoice_number', o.invoice_number,
    'payment_method', o.payment_method,
    'payment_status', o.payment_status,
    'payment_due_at', case when o.status = 'pending' and o.payment_status <> 'paid' then o.payment_due_at end,
    'fulfillment_status', o.fulfillment_status,
    'currency', o.currency,
    'subtotal', o.subtotal,
    'discount_total', o.discount_total,
    'discount_code', o.discount_code,
    'discount_title', (select d.title from public.discounts d where d.id = o.discount_id),
    'shipping_total', o.shipping_total,
    'tax_total', o.tax_total,
    'grand_total', o.grand_total,
    'ship_to', jsonb_build_object('name', o.shipping_address ->> 'name', 'city', o.shipping_address ->> 'city',
                                  'state', o.shipping_address ->> 'state', 'postal_code', o.shipping_address ->> 'postal_code'),
    'shop', jsonb_build_object('name', s.name, 'slug', s.slug, 'support_email', s.settings ->> 'support_email',
                               'support_phone', s.settings ->> 'support_phone'),
    'items', coalesce((select jsonb_agg(jsonb_build_object('title', oi.title, 'quantity', oi.quantity,
                                                           'unit_price', oi.unit_price, 'total', oi.total,
                                                           'image', private.product_cover(v.product_id))
                                        order by oi.created_at)
                       from public.order_items oi
                       left join public.product_variants v on v.id = oi.variant_id
                       where oi.order_id = o.id), '[]'::jsonb),
    'shipments', coalesce((select jsonb_agg(jsonb_build_object('number', sh.number, 'status', sh.status,
                                                               'tracking_token', sh.tracking_token) order by sh.created_at)
                           from public.shipments sh where sh.order_id = o.id and sh.status <> 'cancelled'), '[]'::jsonb)
  )
  from public.orders o join public.shops s on s.id = o.shop_id
  where p_token ~ '^[0-9a-f]{32}$' and o.public_token = p_token;
$$;

-- -----------------------------------------------------------------------------
-- Announcement bar (shops.settings: announcement, announcement_link)
-- -----------------------------------------------------------------------------
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
    'announcement', nullif(btrim(v_shop.settings ->> 'announcement'), ''),
    'announcement_link', nullif(btrim(v_shop.settings ->> 'announcement_link'), ''),
    'policies', (
      select coalesce(jsonb_agg(k.page order by k.ord), '[]'::jsonb)
      from (values (1, 'shipping'), (2, 'returns'), (3, 'privacy'), (4, 'terms')) as k(ord, page)
      where coalesce(btrim(v_shop.settings ->> ('policy_' || k.page)), '') <> ''),
    'payment_methods', (
      select coalesce(jsonb_agg(m order by o), '[]'::jsonb)
      from (values (1, 'online'), (2, 'cod')) as x(o, m)
      where private.shop_accepts(v_shop, m))
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function private.discount_shops_valid() from public;
revoke all on function private.discount_uses(uuid, uuid) from public;
revoke all on function private.evaluate_discount(public.discounts, uuid, numeric, numeric, text) from public;
revoke all on function private.choose_discount(public.shops, numeric, numeric, text, text) from public;
revoke all on function private.redeem_discount(uuid, uuid, text, numeric) from public;
revoke all on function private.allocate_discount(uuid) from public;
revoke all on function private.orders_allocate_discount() from public;
revoke all on function private.price_checkout(public.shops, jsonb, text, text, text) from public;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.storefront_quote(uuid, jsonb, text, text)',
    'public.storefront_checkout_start(uuid, jsonb, jsonb, jsonb, public.payment_method, text)',
    'public.shopper_checkout(uuid, text, uuid, jsonb, jsonb, jsonb, public.payment_method, boolean, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

-- Orders placed before this migration with a discount, not yet invoiced, get
-- their discount spread too (issued invoices are left exactly as issued).
select private.allocate_discount(id) from public.orders
where discount_total > 0 and invoice_number is null and status <> 'cancelled';
