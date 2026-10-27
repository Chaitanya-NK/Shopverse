-- =============================================================================
-- Shopverse · Migration 014 · Shopper accounts
--
--  * Shoppers sign in to a business's storefront with an email code. Their
--    sessions are our own (not Supabase Auth), so a staff login and a shopper
--    login can never mix, even in the same browser.
--  * A shopper account is the organisation's existing customer record (matched
--    by email), so orders placed as a guest appear once they sign in.
--  * Session tokens and codes are stored only as hashes. Every shopper_*
--    function is granted to the server's service role alone: the server holds
--    the session cookie and passes the token in.
--  * Saved addresses, a wishlist, self-service cancellation before dispatch,
--    reorder, and a signed-in checkout that needs no code.
-- =============================================================================

alter table public.customers add column last_sign_in_at timestamptz;

-- -----------------------------------------------------------------------------
-- Saved addresses
-- -----------------------------------------------------------------------------
create table public.customer_addresses (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id     uuid not null,
  label           text check (label is null or char_length(label) <= 40),
  name            text not null check (char_length(name) between 2 and 120),
  phone           text not null check (phone ~ '^\+?[0-9]{8,15}$'),
  line1           text not null check (char_length(line1) between 3 and 200),
  line2           text check (line2 is null or char_length(line2) <= 200),
  city            text not null check (char_length(city) between 2 and 80),
  state           text not null check (char_length(state) between 2 and 80),
  postal_code     text not null check (postal_code ~ '^[1-9][0-9]{5}$'),
  country         char(2) not null default 'IN',
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id) on delete cascade
);

create index customer_addresses_customer_idx on public.customer_addresses (customer_id, created_at);
create unique index customer_addresses_default_uidx on public.customer_addresses (customer_id) where is_default;

create trigger customer_addresses_set_updated_at
  before update on public.customer_addresses
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Wishlist
-- -----------------------------------------------------------------------------
create table public.wishlist_items (
  organization_id uuid not null,
  customer_id     uuid not null,
  product_id      uuid not null,
  created_at      timestamptz not null default now(),
  primary key (customer_id, product_id),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id) on delete cascade,
  foreign key (organization_id, product_id) references public.products (organization_id, id) on delete cascade
);

create index wishlist_items_product_idx on public.wishlist_items (product_id);

-- Staff can see (not change) what shoppers saved; shoppers go through functions.
alter table public.customer_addresses enable row level security;
alter table public.wishlist_items     enable row level security;

create policy "customer addresses: members read" on public.customer_addresses
  for select to authenticated using (private.is_org_member(organization_id));
create policy "wishlist: members read" on public.wishlist_items
  for select to authenticated using (private.is_org_member(organization_id));

revoke all on public.customer_addresses from anon;
revoke all on public.wishlist_items from anon;
revoke insert, update, delete, truncate on public.customer_addresses from authenticated;
revoke insert, update, delete, truncate on public.wishlist_items from authenticated;

-- -----------------------------------------------------------------------------
-- Sign-in codes and sessions (private: never exposed through the API)
-- -----------------------------------------------------------------------------
create table private.shopper_sign_ins (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  shop_id         uuid not null references public.shops (id) on delete cascade,
  email           extensions.citext not null,
  otp_hash        text,
  otp_expires_at  timestamptz not null,
  otp_attempts    integer not null default 0,
  otp_sends       integer not null default 1,
  last_sent_at    timestamptz not null default now(),
  used_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index shopper_sign_ins_rate_idx on private.shopper_sign_ins (organization_id, email, created_at desc);
create index shopper_sign_ins_shop_idx on private.shopper_sign_ins (shop_id, created_at desc);

create table private.shopper_sessions (
  id              uuid primary key default gen_random_uuid(),
  token_hash      text not null unique,
  organization_id uuid not null,
  customer_id     uuid not null,
  user_agent      text,
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  foreign key (organization_id, customer_id) references public.customers (organization_id, id) on delete cascade
);

create index shopper_sessions_customer_idx on private.shopper_sessions (customer_id);

-- Signed-in checkouts are idempotent per request id (double clicks, retries).
create table private.shopper_checkouts (
  request_id  uuid primary key,
  customer_id uuid not null references public.customers (id) on delete cascade,
  order_id    uuid not null references public.orders (id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Session helpers
-- -----------------------------------------------------------------------------
create or replace function private.sha256_hex(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(p_value, 'sha256'), 'hex');
$$;

-- The customer behind a session token, if the session is valid for this shop's
-- organisation. Null otherwise.
create or replace function private.shopper_customer(p_shop_id uuid, p_token text)
returns public.customers
language sql
stable
security definer
set search_path = ''
as $$
  select c.*
  from private.shopper_sessions s
  join public.shops sh on sh.id = p_shop_id and sh.organization_id = s.organization_id
  join public.customers c on c.id = s.customer_id
  where p_token ~ '^[0-9a-f]{64}$'
    and s.token_hash = private.sha256_hex(p_token)
    and s.revoked_at is null
    and s.expires_at > now();
$$;

create or replace function private.require_shopper(p_shop_id uuid, p_token text)
returns public.customers
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer public.customers;
begin
  v_customer := private.shopper_customer(p_shop_id, p_token);
  if v_customer.id is null then
    raise exception 'Your session has ended. Please sign in again.' using errcode = '42501';
  end if;
  return v_customer;
end;
$$;

-- Same rule staff and shoppers share: nothing has left the warehouse yet.
create or replace function private.order_cancellable(p_order public.orders)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_order.status in ('pending', 'confirmed')
    and not exists (
      select 1 from public.shipments
      where order_id = p_order.id and status not in ('cancelled', 'returned_to_origin')
    );
$$;

-- Where an order is, in the customer's words.
create or replace function private.order_stage(p_order public.orders)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_order.status = 'cancelled' then 'cancelled'
    when p_order.fulfillment_status = 'returned' then 'returned'
    when p_order.status = 'completed' or p_order.fulfillment_status = 'fulfilled' then 'delivered'
    when exists (select 1 from public.shipments where order_id = p_order.id and status = 'out_for_delivery') then 'out_for_delivery'
    when exists (select 1 from public.shipments where order_id = p_order.id
                 and status in ('picked_up', 'in_transit', 'failed_attempt', 'delivered')) then 'shipped'
    when exists (select 1 from public.shipments where order_id = p_order.id and status = 'packed') then 'packed'
    when p_order.status = 'confirmed' then 'confirmed'
    else 'placed'
  end;
$$;

-- -----------------------------------------------------------------------------
-- Cancellation core (staff and shoppers)
-- -----------------------------------------------------------------------------
create or replace function private.cancel_order_core(p_order_id uuid, p_reason text, p_by_customer boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_alloc public.order_allocations;
  v_reason text := nullif(btrim(p_reason), '');
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.status in ('cancelled', 'completed') then
    raise exception 'This order is already %', v_order.status using errcode = 'check_violation';
  end if;
  if not private.order_cancellable(v_order) then
    raise exception '%', case when p_by_customer
      then 'This order has already been packed or shipped, so it can''t be cancelled here. Please contact the shop.'
      else 'Cancel or return its shipments first' end
      using errcode = 'check_violation';
  end if;

  for v_alloc in select * from public.order_allocations where order_id = p_order_id for update loop
    if v_alloc.quantity > v_alloc.shipped_quantity then
      perform private.release_stock(v_alloc.variant_id, v_alloc.warehouse_id, v_alloc.quantity - v_alloc.shipped_quantity);
    end if;
  end loop;
  delete from public.order_allocations a
  where a.order_id = p_order_id and a.shipped_quantity = 0
    and not exists (select 1 from public.shipment_items si where si.allocation_id = a.id);
  update public.order_allocations set quantity = shipped_quantity where order_id = p_order_id;

  update public.orders
  set status = 'cancelled', cancelled_at = now(), cancel_reason = v_reason
  where id = p_order_id;

  perform private.add_order_event(v_order.organization_id, p_order_id, 'order.cancelled',
    case when p_by_customer then 'Cancelled by the customer' else 'Cancelled' end || coalesce(': ' || v_reason, ''),
    jsonb_build_object('refund_due', v_order.payment_status = 'paid', 'by_customer', p_by_customer));
end;
$$;

create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.authorize_order(p_order_id, array['owner', 'admin', 'manager']::public.org_role[]);
  perform private.cancel_order_core(p_order_id, p_reason, false);
end;
$$;

-- -----------------------------------------------------------------------------
-- Checkout pricing, shared by guest and signed-in checkout
-- -----------------------------------------------------------------------------
create or replace function private.price_checkout(p_shop public.shops, p_lines jsonb)
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
begin
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

  v_cod_limit := private.shop_setting_numeric(p_shop.settings, 'cod_limit');
  if v_cod_limit is not null and v_subtotal + v_shipping > v_cod_limit then
    raise exception 'Cash on delivery is available for orders up to %', v_cod_limit using errcode = 'check_violation';
  end if;

  return jsonb_build_object('lines', v_lines, 'subtotal', v_subtotal, 'shipping_total', v_shipping,
                            'grand_total', v_subtotal + v_shipping);
end;
$$;

-- Guest checkout keeps its behaviour; pricing now comes from the shared helper.
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
  if p_payment_method <> 'cod' then
    raise exception 'Only cash on delivery is available at the moment' using errcode = 'check_violation';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address' using errcode = 'check_violation';
  end if;
  if (select count(*) from private.checkout_sessions
      where shop_id = p_shop_id and email = v_email::extensions.citext
        and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many checkout attempts. Please try again in a little while.' using errcode = 'check_violation';
  end if;

  v_price := private.price_checkout(v_shop, p_lines);

  insert into private.checkout_sessions (
    shop_id, email, contact, address, lines, payment_method, subtotal, shipping_total, grand_total,
    otp_hash, otp_expires_at, otp_sends, last_sent_at
  ) values (
    p_shop_id, v_email, p_contact, p_address, v_price -> 'lines', p_payment_method,
    (v_price ->> 'subtotal')::numeric, (v_price ->> 'shipping_total')::numeric, (v_price ->> 'grand_total')::numeric,
    extensions.crypt(v_otp, extensions.gen_salt('bf', 8)), now() + interval '10 minutes', 1, now()
  )
  returning id into v_id;

  return jsonb_build_object('checkout_id', v_id, 'otp', v_otp, 'email', v_email,
    'subtotal', v_price -> 'subtotal', 'shipping_total', v_price -> 'shipping_total',
    'grand_total', v_price -> 'grand_total');
end;
$$;

-- -----------------------------------------------------------------------------
-- Sign in
-- -----------------------------------------------------------------------------
create or replace function public.shopper_sign_in_start(p_shop_id uuid, p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_shop  public.shops;
  v_email text := nullif(lower(btrim(p_email)), '');
  v_otp   text := private.new_otp();
  v_id    uuid;
begin
  select * into v_shop from public.shops where id = p_shop_id;
  if v_shop.id is null or v_shop.status <> 'live' then
    raise exception 'This shop isn''t open yet' using errcode = 'check_violation';
  end if;
  if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address' using errcode = 'check_violation';
  end if;
  -- Per address, and per shop so nobody can use it to spam many inboxes.
  if (select count(*) from private.shopper_sign_ins
      where organization_id = v_shop.organization_id and email = v_email::extensions.citext
        and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many sign-in attempts. Please try again in a little while.' using errcode = 'check_violation';
  end if;
  if (select count(*) from private.shopper_sign_ins
      where shop_id = p_shop_id and created_at > now() - interval '10 minutes') >= 300 then
    raise exception 'Sign-in is busy right now. Please try again in a few minutes.' using errcode = 'check_violation';
  end if;

  insert into private.shopper_sign_ins (organization_id, shop_id, email, otp_hash, otp_expires_at)
  values (v_shop.organization_id, p_shop_id, v_email,
          extensions.crypt(v_otp, extensions.gen_salt('bf', 8)), now() + interval '10 minutes')
  returning id into v_id;

  return jsonb_build_object('sign_in_id', v_id, 'otp', v_otp, 'email', v_email);
end;
$$;

create or replace function public.shopper_sign_in_resend(p_sign_in_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row private.shopper_sign_ins;
  v_otp text := private.new_otp();
begin
  select * into v_row from private.shopper_sign_ins where id = p_sign_in_id for update;
  if v_row.id is null or v_row.used_at is not null or v_row.created_at < now() - interval '1 hour' then
    raise exception 'This sign-in has expired. Please start again.' using errcode = 'check_violation';
  end if;
  if v_row.otp_sends >= 3 then
    raise exception 'We''ve sent the code three times. Please start again.' using errcode = 'check_violation';
  end if;
  if v_row.last_sent_at > now() - interval '30 seconds' then
    raise exception 'Please wait a few seconds before asking for another code' using errcode = 'check_violation';
  end if;

  update private.shopper_sign_ins
  set otp_hash = extensions.crypt(v_otp, extensions.gen_salt('bf', 8)),
      otp_expires_at = now() + interval '10 minutes',
      otp_attempts = 0,
      otp_sends = otp_sends + 1,
      last_sent_at = now()
  where id = p_sign_in_id;

  return jsonb_build_object('otp', v_otp, 'email', v_row.email::text, 'sends_left', 3 - v_row.otp_sends - 1);
end;
$$;

-- Check the code; on success find or create the customer and open a 30-day
-- session. Returns the plain session token once (the server sets the cookie).
create or replace function public.shopper_sign_in_verify(p_sign_in_id uuid, p_otp text, p_user_agent text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row         private.shopper_sign_ins;
  v_customer_id uuid;
  v_name        text;
  v_token       text := encode(extensions.gen_random_bytes(32), 'hex');
  c_max         constant integer := 5;
begin
  select * into v_row from private.shopper_sign_ins where id = p_sign_in_id for update;
  if v_row.id is null or v_row.used_at is not null then
    return jsonb_build_object('ok', false, 'message', 'This sign-in has expired. Please start again.');
  end if;
  if v_row.otp_expires_at < now() then
    return jsonb_build_object('ok', false, 'expired', true, 'message', 'The code has expired. Ask for a new one.');
  end if;
  if v_row.otp_attempts >= c_max then
    return jsonb_build_object('ok', false, 'locked', true, 'message', 'Too many wrong codes. Ask for a new one.');
  end if;
  if p_otp is null or p_otp !~ '^[0-9]{6}$' or extensions.crypt(p_otp, v_row.otp_hash) <> v_row.otp_hash then
    update private.shopper_sign_ins set otp_attempts = otp_attempts + 1 where id = p_sign_in_id;
    return jsonb_build_object('ok', false, 'attempts_left', c_max - v_row.otp_attempts - 1,
      'message', 'That code is not right');
  end if;

  select id, full_name into v_customer_id, v_name from public.customers
  where organization_id = v_row.organization_id and email = v_row.email;

  if v_customer_id is null then
    insert into public.customers (organization_id, email, email_verified_at, last_sign_in_at)
    values (v_row.organization_id, v_row.email, now(), now())
    returning id into v_customer_id;
  else
    update public.customers
    set email_verified_at = coalesce(email_verified_at, now()), last_sign_in_at = now()
    where id = v_customer_id;
  end if;

  update private.shopper_sign_ins set used_at = now(), otp_hash = null where id = p_sign_in_id;

  -- Keep the table tidy: this person's old codes and long-dead sessions.
  delete from private.shopper_sign_ins
  where organization_id = v_row.organization_id and email = v_row.email and created_at < now() - interval '1 day';
  delete from private.shopper_sessions
  where customer_id = v_customer_id and (expires_at < now() - interval '30 days' or revoked_at < now() - interval '30 days');

  insert into private.shopper_sessions (token_hash, organization_id, customer_id, user_agent, expires_at)
  values (private.sha256_hex(v_token), v_row.organization_id, v_customer_id, left(p_user_agent, 300),
          now() + interval '30 days');

  return jsonb_build_object('ok', true, 'token', v_token, 'needs_name', v_name is null);
end;
$$;

create or replace function public.shopper_sign_out(p_token text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update private.shopper_sessions set revoked_at = now()
  where p_token ~ '^[0-9a-f]{64}$' and token_hash = private.sha256_hex(p_token) and revoked_at is null;
$$;

-- -----------------------------------------------------------------------------
-- Profile, addresses
-- -----------------------------------------------------------------------------
create or replace function private.shopper_addresses_json(p_customer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'label', a.label, 'name', a.name, 'phone', a.phone, 'line1', a.line1, 'line2', a.line2,
           'city', a.city, 'state', a.state, 'postal_code', a.postal_code, 'is_default', a.is_default)
         order by a.is_default desc, a.created_at), '[]'::jsonb)
  from public.customer_addresses a where a.customer_id = p_customer_id;
$$;

-- Who is signed in (null when nobody). Also slides the session forward.
create or replace function public.shopper_me(p_shop_id uuid, p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_customer public.customers;
begin
  v_customer := private.shopper_customer(p_shop_id, p_token);
  if v_customer.id is null then
    return null;
  end if;

  update private.shopper_sessions
  set last_seen_at = now(), expires_at = greatest(expires_at, now() + interval '30 days')
  where token_hash = private.sha256_hex(p_token) and last_seen_at < now() - interval '1 day';

  return jsonb_build_object(
    'id', v_customer.id,
    'name', v_customer.full_name,
    'email', v_customer.email::text,
    'phone', v_customer.phone,
    'accepts_marketing', v_customer.accepts_marketing,
    'addresses', private.shopper_addresses_json(v_customer.id),
    'wishlist', coalesce((select jsonb_agg(w.product_id order by w.created_at desc)
                          from public.wishlist_items w where w.customer_id = v_customer.id), '[]'::jsonb)
  );
end;
$$;

create or replace function public.shopper_update_profile(p_shop_id uuid, p_token text, p_profile jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_customer public.customers := private.require_shopper(p_shop_id, p_token);
  v_name     text := nullif(btrim(p_profile ->> 'name'), '');
  v_phone    text := nullif(regexp_replace(coalesce(p_profile ->> 'phone', ''), '[\s()-]', '', 'g'), '');
begin
  if v_name is null or char_length(v_name) not between 2 and 120 then
    raise exception 'Enter your name' using errcode = 'check_violation';
  end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9]{8,15}$' then
    raise exception 'Enter a valid mobile number' using errcode = 'check_violation';
  end if;

  begin
    update public.customers
    set full_name = v_name,
        phone = v_phone,
        accepts_marketing = coalesce((p_profile ->> 'accepts_marketing')::boolean, accepts_marketing)
    where id = v_customer.id;
  exception when unique_violation then
    raise exception 'That mobile number is already linked to another account' using errcode = '23505';
  end;
end;
$$;

create or replace function public.shopper_save_address(
  p_shop_id    uuid,
  p_token      text,
  p_address    jsonb,
  p_address_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_customer public.customers := private.require_shopper(p_shop_id, p_token);
  v_id       uuid := p_address_id;
  v_default  boolean := coalesce((p_address ->> 'is_default')::boolean, false);
  v_phone    text := regexp_replace(coalesce(p_address ->> 'phone', ''), '[\s()-]', '', 'g');
begin
  if v_id is null and (select count(*) from public.customer_addresses where customer_id = v_customer.id) >= 10 then
    raise exception 'You can save up to 10 addresses. Remove one to add another.' using errcode = 'check_violation';
  end if;
  if v_id is not null and not exists (
    select 1 from public.customer_addresses where id = v_id and customer_id = v_customer.id
  ) then
    raise exception 'Address not found' using errcode = 'P0002';
  end if;
  -- The first address is the default.
  if not exists (select 1 from public.customer_addresses where customer_id = v_customer.id and id is distinct from v_id) then
    v_default := true;
  end if;
  if v_default then
    update public.customer_addresses set is_default = false
    where customer_id = v_customer.id and is_default and id is distinct from v_id;
  end if;

  if v_id is null then
    insert into public.customer_addresses (organization_id, customer_id, label, name, phone, line1, line2,
                                           city, state, postal_code, is_default)
    values (v_customer.organization_id, v_customer.id, nullif(btrim(p_address ->> 'label'), ''),
            btrim(p_address ->> 'name'), v_phone, btrim(p_address ->> 'line1'), nullif(btrim(p_address ->> 'line2'), ''),
            btrim(p_address ->> 'city'), btrim(p_address ->> 'state'), btrim(p_address ->> 'postal_code'), v_default)
    returning id into v_id;
  else
    update public.customer_addresses
    set label = nullif(btrim(p_address ->> 'label'), ''),
        name = btrim(p_address ->> 'name'),
        phone = v_phone,
        line1 = btrim(p_address ->> 'line1'),
        line2 = nullif(btrim(p_address ->> 'line2'), ''),
        city = btrim(p_address ->> 'city'),
        state = btrim(p_address ->> 'state'),
        postal_code = btrim(p_address ->> 'postal_code'),
        is_default = v_default or is_default
    where id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.shopper_delete_address(p_shop_id uuid, p_token text, p_address_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_customer public.customers := private.require_shopper(p_shop_id, p_token);
  v_was_default boolean;
begin
  delete from public.customer_addresses where id = p_address_id and customer_id = v_customer.id
  returning is_default into v_was_default;
  if v_was_default then
    update public.customer_addresses set is_default = true
    where id = (select id from public.customer_addresses where customer_id = v_customer.id
                order by created_at desc limit 1);
  end if;
end;
$$;

create or replace function public.shopper_set_default_address(p_shop_id uuid, p_token text, p_address_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_customer public.customers := private.require_shopper(p_shop_id, p_token);
begin
  if not exists (select 1 from public.customer_addresses where id = p_address_id and customer_id = v_customer.id) then
    raise exception 'Address not found' using errcode = 'P0002';
  end if;
  update public.customer_addresses set is_default = false where customer_id = v_customer.id and is_default;
  update public.customer_addresses set is_default = true where id = p_address_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Orders
-- -----------------------------------------------------------------------------
create or replace function public.shopper_orders(
  p_shop_id uuid,
  p_token   text,
  p_limit   integer default 10,
  p_offset  integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer public.customers := private.require_shopper(p_shop_id, p_token);
begin
  return jsonb_build_object(
    'total', (select count(*) from public.orders where customer_id = v_customer.id and shop_id = p_shop_id),
    'items', coalesce((
      select jsonb_agg(x.j order by x.placed_at desc)
      from (
        select o.placed_at, jsonb_build_object(
          'number', o.number,
          'placed_at', o.placed_at,
          'status', o.status,
          'stage', private.order_stage(o),
          'grand_total', o.grand_total,
          'currency', o.currency,
          'public_token', o.public_token,
          'can_cancel', private.order_cancellable(o),
          'item_count', (select coalesce(sum(quantity), 0) from public.order_items where order_id = o.id),
          'titles', (select coalesce(jsonb_agg(t.title), '[]'::jsonb)
                     from (select title from public.order_items where order_id = o.id order by created_at limit 3) t)
        ) as j
        from public.orders o
        where o.customer_id = v_customer.id and o.shop_id = p_shop_id
        order by o.placed_at desc
        limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
      ) x), '[]'::jsonb)
  );
end;
$$;

-- What a signed-in shopper may do with one of their orders (null if not theirs).
create or replace function public.shopper_order_access(p_shop_id uuid, p_token text, p_order_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('can_cancel', private.order_cancellable(o),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('variant_id', oi.variant_id, 'quantity', oi.quantity)
                                        order by oi.created_at)
                       from public.order_items oi where oi.order_id = o.id and oi.variant_id is not null), '[]'::jsonb))
  from public.orders o
  where o.public_token = p_order_token
    and o.shop_id = p_shop_id
    and o.customer_id = (private.shopper_customer(p_shop_id, p_token)).id;
$$;

create or replace function public.shopper_cancel_order(p_shop_id uuid, p_token text, p_order_token text, p_reason text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_customer public.customers := private.require_shopper(p_shop_id, p_token);
  v_order_id uuid;
begin
  select id into v_order_id from public.orders
  where public_token = p_order_token and shop_id = p_shop_id and customer_id = v_customer.id;
  if v_order_id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  perform private.cancel_order_core(v_order_id, left(p_reason, 300), true);
end;
$$;

-- -----------------------------------------------------------------------------
-- Wishlist
-- -----------------------------------------------------------------------------

-- Product cards in the same shape as the catalogue's, for a list of products
-- that are visible in this shop.
create or replace function private.storefront_cards(p_shop_id uuid, p_product_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'slug', x.slug, 'title', x.title, 'category', x.category_name, 'industry', x.industry,
           'min_price', x.min_price, 'max_price', x.max_price, 'compare_at', x.compare_at, 'in_stock', x.in_stock)
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

create or replace function public.shopper_wishlist(p_shop_id uuid, p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer public.customers := private.require_shopper(p_shop_id, p_token);
begin
  return private.storefront_cards(p_shop_id, array(
    select product_id from public.wishlist_items where customer_id = v_customer.id order by created_at desc));
end;
$$;

create or replace function public.shopper_set_wishlist(p_shop_id uuid, p_token text, p_product_id uuid, p_saved boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_customer public.customers := private.require_shopper(p_shop_id, p_token);
begin
  if not p_saved then
    delete from public.wishlist_items where customer_id = v_customer.id and product_id = p_product_id;
    return;
  end if;
  if not exists (select 1 from private.storefront_products(p_shop_id) p where p.id = p_product_id) then
    raise exception 'This product isn''t available' using errcode = 'P0002';
  end if;
  if (select count(*) from public.wishlist_items where customer_id = v_customer.id) >= 200 then
    raise exception 'Your wishlist is full (200 items). Remove some to save more.' using errcode = 'check_violation';
  end if;
  insert into public.wishlist_items (organization_id, customer_id, product_id)
  values (v_customer.organization_id, v_customer.id, p_product_id)
  on conflict do nothing;
end;
$$;

-- -----------------------------------------------------------------------------
-- Signed-in checkout: the email is already verified by the session, so the
-- order is placed straight away. Idempotent per request id.
-- -----------------------------------------------------------------------------
create or replace function public.shopper_checkout(
  p_shop_id        uuid,
  p_token          text,
  p_request_id     uuid,
  p_lines          jsonb,
  p_contact        jsonb,
  p_address        jsonb,
  p_payment_method public.payment_method default 'cod',
  p_save_address   boolean default false
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
    if p_payment_method <> 'cod' then
      raise exception 'Only cash on delivery is available at the moment' using errcode = 'check_violation';
    end if;
    if (select count(*) from public.orders
        where customer_id = v_customer.id and source = 'storefront' and placed_at > now() - interval '1 hour') >= 10 then
      raise exception 'You''ve placed a lot of orders in the last hour. Please try again later.' using errcode = 'check_violation';
    end if;

    v_price := private.price_checkout(v_shop, p_lines);

    v_order_id := private.create_order_core(
      p_shop_id,
      jsonb_build_object('full_name', p_contact ->> 'name', 'email', v_customer.email::text, 'phone', p_contact ->> 'phone'),
      p_address,
      v_price -> 'lines',
      p_payment_method,
      'pending',
      (v_price ->> 'shipping_total')::numeric,
      0,
      p_contact ->> 'note',
      'storefront');

    perform private.add_order_event(v_shop.organization_id, v_order_id, 'customer.verified',
      'Placed while signed in as ' || v_customer.email::text);
    perform private.confirm_order_core(v_order_id);

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
    'public_token', v_order.public_token, 'grand_total', v_order.grand_total);
end;
$$;

-- Admin: show whether a customer has signed in.
create or replace view public.customer_overview
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
  lower(coalesce(c.full_name, '') || ' ' || coalesce(c.email::text, '') || ' ' || coalesce(c.phone, '')) as search_text,
  c.last_sign_in_at
from public.customers c
left join lateral (
  select count(*) filter (where o.status <> 'cancelled') as orders,
         sum(o.grand_total) filter (where o.status <> 'cancelled') as spent,
         max(o.placed_at) as last_order_at
  from public.orders o where o.customer_id = c.id
) s on true;

-- -----------------------------------------------------------------------------
-- Privileges: private helpers for nobody; shopper functions for the server only.
-- -----------------------------------------------------------------------------
revoke all on function private.sha256_hex(text) from public;
revoke all on function private.shopper_customer(uuid, text) from public;
revoke all on function private.require_shopper(uuid, text) from public;
revoke all on function private.order_cancellable(public.orders) from public;
revoke all on function private.order_stage(public.orders) from public;
revoke all on function private.cancel_order_core(uuid, text, boolean) from public;
revoke all on function private.price_checkout(public.shops, jsonb) from public;
revoke all on function private.shopper_addresses_json(uuid) from public;
revoke all on function private.storefront_cards(uuid, uuid[]) from public;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.shopper_sign_in_start(uuid, text)',
    'public.shopper_sign_in_resend(uuid)',
    'public.shopper_sign_in_verify(uuid, text, text)',
    'public.shopper_sign_out(text)',
    'public.shopper_me(uuid, text)',
    'public.shopper_update_profile(uuid, text, jsonb)',
    'public.shopper_save_address(uuid, text, jsonb, uuid)',
    'public.shopper_delete_address(uuid, text, uuid)',
    'public.shopper_set_default_address(uuid, text, uuid)',
    'public.shopper_orders(uuid, text, integer, integer)',
    'public.shopper_order_access(uuid, text, text)',
    'public.shopper_cancel_order(uuid, text, text, text)',
    'public.shopper_wishlist(uuid, text)',
    'public.shopper_set_wishlist(uuid, text, uuid, boolean)',
    'public.shopper_checkout(uuid, text, uuid, jsonb, jsonb, jsonb, public.payment_method, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
