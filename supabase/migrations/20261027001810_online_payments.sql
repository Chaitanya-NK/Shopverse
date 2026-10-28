-- =============================================================================
-- Shopverse · Migration 018b · Online payments (Razorpay)
--
--  * Each organisation connects its own Razorpay account. Secrets arrive
--    already encrypted by the server (AES-256-GCM, key outside the database)
--    and are readable only by the service role.
--  * An online order is created "awaiting payment": stock is reserved but the
--    order isn't confirmed. It's confirmed only when a captured payment is
--    recorded (checkout callback with a verified signature, or the webhook).
--    Unpaid orders are cancelled after 30 minutes, releasing their stock.
--  * public.payments keeps every attempt. Recording a capture is idempotent
--    and reports when money must go back (duplicate payment, amount mismatch,
--    order already cancelled).
--  * Shops choose which methods they accept (cash on delivery, online).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Payment accounts (one per organisation)
-- -----------------------------------------------------------------------------
create table private.payment_accounts (
  organization_id     uuid primary key references public.organizations (id) on delete cascade,
  provider            text not null default 'razorpay' check (provider = 'razorpay'),
  key_id              text not null check (key_id ~ '^rzp_(test|live)_[A-Za-z0-9]{6,40}$'),
  key_secret_enc      text not null,
  webhook_secret_enc  text,
  enabled             boolean not null default true,
  updated_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger payment_accounts_set_updated_at
  before update on private.payment_accounts
  for each row execute function private.set_updated_at();

-- What owners and admins may see: never the secrets.
create or replace function public.get_payment_settings(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account private.payment_accounts;
begin
  if not private.has_org_role(p_organization_id, array['owner', 'admin']::public.org_role[]) then
    raise exception 'Only owners and admins can see payment settings' using errcode = '42501';
  end if;
  select * into v_account from private.payment_accounts where organization_id = p_organization_id;
  if v_account.organization_id is null then
    return jsonb_build_object('connected', false);
  end if;
  return jsonb_build_object(
    'connected', true,
    'provider', v_account.provider,
    'key_id', v_account.key_id,
    'mode', case when v_account.key_id like 'rzp_live_%' then 'live' else 'test' end,
    'enabled', v_account.enabled,
    'webhook_configured', v_account.webhook_secret_enc is not null,
    'updated_at', v_account.updated_at);
end;
$$;

-- Connect or update. Null secrets keep the stored ones (so the key id or the
-- switch can change without re-entering them).
create or replace function public.save_payment_account(
  p_organization_id    uuid,
  p_key_id             text,
  p_key_secret_enc     text default null,
  p_webhook_secret_enc text default null,
  p_enabled            boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_org_role(p_organization_id, array['owner', 'admin']::public.org_role[]) then
    raise exception 'Only owners and admins can change payment settings' using errcode = '42501';
  end if;
  if p_key_id is null or p_key_id !~ '^rzp_(test|live)_[A-Za-z0-9]{6,40}$' then
    raise exception 'Enter a Razorpay key id (it starts with rzp_test_ or rzp_live_)' using errcode = 'check_violation';
  end if;

  if exists (select 1 from private.payment_accounts where organization_id = p_organization_id) then
    update private.payment_accounts
    set key_id = p_key_id,
        key_secret_enc = coalesce(p_key_secret_enc, key_secret_enc),
        webhook_secret_enc = coalesce(p_webhook_secret_enc, webhook_secret_enc),
        enabled = coalesce(p_enabled, enabled),
        updated_by = auth.uid()
    where organization_id = p_organization_id;
  else
    if p_key_secret_enc is null then
      raise exception 'Enter the key secret' using errcode = 'check_violation';
    end if;
    insert into private.payment_accounts (organization_id, key_id, key_secret_enc, webhook_secret_enc, enabled, updated_by)
    values (p_organization_id, p_key_id, p_key_secret_enc, p_webhook_secret_enc, coalesce(p_enabled, true), auth.uid());
  end if;

  perform private.log_audit(p_organization_id, 'payments.updated', 'payment_account', p_organization_id,
    jsonb_build_object('key_id', p_key_id, 'enabled', p_enabled,
                       'secret_changed', p_key_secret_enc is not null,
                       'webhook_secret_changed', p_webhook_secret_enc is not null));
end;
$$;

create or replace function public.disconnect_payment_account(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_org_role(p_organization_id, array['owner', 'admin']::public.org_role[]) then
    raise exception 'Only owners and admins can change payment settings' using errcode = '42501';
  end if;
  delete from private.payment_accounts where organization_id = p_organization_id;
  perform private.log_audit(p_organization_id, 'payments.disconnected', 'payment_account', p_organization_id, '{}'::jsonb);
end;
$$;

-- Server only: the encrypted credentials, to call Razorpay or verify webhooks.
create or replace function public.payment_account_credentials(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('key_id', key_id, 'key_secret_enc', key_secret_enc,
                            'webhook_secret_enc', webhook_secret_enc, 'enabled', enabled)
  from private.payment_accounts where organization_id = p_organization_id;
$$;

-- -----------------------------------------------------------------------------
-- Which methods a shop accepts
-- -----------------------------------------------------------------------------
create or replace function private.shop_accepts(p_shop public.shops, p_method text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_method
    when 'cod' then coalesce((p_shop.settings ->> 'accept_cod')::boolean, true)
    when 'online' then coalesce((p_shop.settings ->> 'accept_online')::boolean, true)
      and exists (select 1 from private.payment_accounts a
                  where a.organization_id = p_shop.organization_id and a.enabled)
    else false
  end;
$$;

-- -----------------------------------------------------------------------------
-- Payments
-- -----------------------------------------------------------------------------
alter table public.orders add column payment_due_at timestamptz;

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null,
  order_id            uuid not null,
  provider            text not null default 'razorpay',
  provider_order_id   text not null unique,
  provider_payment_id text unique,
  amount              numeric(12, 2) not null check (amount > 0),
  currency            char(3) not null,
  status              text not null default 'created'
                      check (status in ('created', 'captured', 'failed', 'refunded', 'partially_refunded')),
  method              text,
  error               text check (error is null or char_length(error) <= 500),
  refunded_amount     numeric(12, 2) not null default 0 check (refunded_amount >= 0),
  refund_due          boolean not null default false,
  captured_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (organization_id, order_id) references public.orders (organization_id, id) on delete cascade
);

create index payments_order_idx on public.payments (order_id, created_at);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function private.set_updated_at();

alter table public.payments enable row level security;
create policy "payments: read with shop access" on public.payments
  for select to authenticated using (
    exists (select 1 from public.orders o
            where o.id = order_id and private.can_access_shop(o.organization_id, o.shop_id)));
revoke all on public.payments from anon;
revoke insert, update, delete, truncate on public.payments from authenticated;

create table private.webhook_events (
  event_id        text primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event           text not null,
  received_at     timestamptz not null default now()
);

-- Razorpay's method names -> ours.
create or replace function private.payment_method_from(p_method text)
returns public.payment_method
language sql
immutable
set search_path = ''
as $$
  select case p_method
    when 'upi' then 'upi'
    when 'card' then 'card'
    when 'emi' then 'card'
    when 'netbanking' then 'netbanking'
    when 'wallet' then 'wallet'
    when 'paylater' then 'wallet'
    else 'online'
  end::public.payment_method;
$$;

-- -----------------------------------------------------------------------------
-- Customer-facing stage: awaiting payment comes first.
-- -----------------------------------------------------------------------------
create or replace function private.order_stage(p_order public.orders)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_order.status = 'cancelled' then 'cancelled'
    when p_order.status = 'pending' and p_order.payment_due_at is not null
         and p_order.payment_status <> 'paid' then 'awaiting_payment'
    when p_order.fulfillment_status = 'returned' then 'returned'
    when p_order.status = 'completed' then 'delivered'
    when exists (select 1 from public.shipments where order_id = p_order.id and status = 'out_for_delivery') then 'out_for_delivery'
    when exists (select 1 from public.shipments where order_id = p_order.id
                 and status in ('picked_up', 'in_transit', 'failed_attempt', 'delivered')) then 'shipped'
    when exists (select 1 from public.shipments where order_id = p_order.id and status = 'packed') then 'packed'
    when p_order.status = 'confirmed' then 'confirmed'
    else 'placed'
  end;
$$;

-- Staff can't confirm an order that is waiting for its online payment (its
-- stock is already reserved; the payment confirms it).
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
  if v_order.payment_due_at is not null and v_order.payment_status <> 'paid' then
    raise exception 'This order is waiting for the customer''s online payment' using errcode = 'check_violation';
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

-- Reserve stock for an online order and give the customer 30 minutes to pay.
create or replace function private.hold_for_payment(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  perform private.route_order(p_order_id);
  update public.orders set payment_due_at = now() + interval '30 minutes' where id = p_order_id;
  perform private.add_order_event(v_order.organization_id, p_order_id, 'payment.awaiting',
    'Waiting for online payment; stock held for 30 minutes');
end;
$$;

-- -----------------------------------------------------------------------------
-- Checkout: pricing knows the method (the COD limit only applies to COD)
-- -----------------------------------------------------------------------------
drop function private.price_checkout(public.shops, jsonb);

create or replace function private.price_checkout(p_shop public.shops, p_lines jsonb, p_method text)
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

  v_cod_limit := private.shop_setting_numeric(p_shop.settings, 'cod_limit');
  if p_method = 'cod' and v_cod_limit is not null and v_subtotal + v_shipping > v_cod_limit then
    raise exception 'Cash on delivery is available for orders up to %. Please pay online.', v_cod_limit
      using errcode = 'check_violation';
  end if;

  return jsonb_build_object('lines', v_lines, 'subtotal', v_subtotal, 'shipping_total', v_shipping,
                            'grand_total', v_subtotal + v_shipping);
end;
$$;

-- Guest checkout start: accepts 'cod' or 'online'.
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
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address' using errcode = 'check_violation';
  end if;
  if (select count(*) from private.checkout_sessions
      where shop_id = p_shop_id and email = v_email::extensions.citext
        and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many checkout attempts. Please try again in a little while.' using errcode = 'check_violation';
  end if;

  v_price := private.price_checkout(v_shop, p_lines, p_payment_method::text);

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

-- Guest checkout confirm: COD orders are confirmed; online orders wait for payment.
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
      v_session.shipping_total, 0, v_session.contact ->> 'note', 'storefront');

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

-- Signed-in checkout, same rules.
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
    if (select count(*) from public.orders
        where customer_id = v_customer.id and source = 'storefront' and placed_at > now() - interval '1 hour') >= 10 then
      raise exception 'You''ve placed a lot of orders in the last hour. Please try again later.' using errcode = 'check_violation';
    end if;

    v_price := private.price_checkout(v_shop, p_lines, p_payment_method::text);

    v_order_id := private.create_order_core(
      p_shop_id,
      jsonb_build_object('full_name', p_contact ->> 'name', 'email', v_customer.email::text, 'phone', p_contact ->> 'phone'),
      p_address, v_price -> 'lines', p_payment_method, 'pending',
      (v_price ->> 'shipping_total')::numeric, 0, p_contact ->> 'note', 'storefront');

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
-- Paying (server only)
-- -----------------------------------------------------------------------------

-- Cancel online orders whose time to pay has run out. Returns how many.
create or replace function public.expire_unpaid_orders(p_organization_id uuid default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_count integer := 0;
begin
  for v_id in
    select id from public.orders
    where status = 'pending' and payment_status <> 'paid'
      and payment_due_at is not null and payment_due_at < now()
      and (p_organization_id is null or organization_id = p_organization_id)
    order by payment_due_at
    limit 500
    for update skip locked
  loop
    perform private.cancel_order_core(v_id, 'Online payment wasn''t completed in time', false);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Everything needed to start a payment for an order awaiting one, or
-- { expired: true } after cancelling an order whose time ran out.
create or replace function public.begin_online_payment(p_order_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders
  where p_order_token ~ '^[0-9a-f]{32}$' and public_token = p_order_token for update;
  if v_order.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.payment_status = 'paid' then
    raise exception 'This order is already paid' using errcode = 'check_violation';
  end if;
  if v_order.status <> 'pending' or v_order.payment_due_at is null then
    raise exception 'This order isn''t waiting for a payment' using errcode = 'check_violation';
  end if;
  if v_order.payment_due_at < now() then
    -- Returned, not raised: raising would roll the cancellation back.
    perform private.cancel_order_core(v_order.id, 'Online payment wasn''t completed in time', false);
    return jsonb_build_object('expired', true, 'order_id', v_order.id);
  end if;
  if (select count(*) from public.payments where order_id = v_order.id) >= 10 then
    raise exception 'Too many payment attempts for this order. Please contact the shop.' using errcode = 'check_violation';
  end if;

  return (
    select jsonb_build_object(
      'order_id', v_order.id, 'organization_id', v_order.organization_id, 'number', v_order.number,
      'amount', v_order.grand_total, 'currency', v_order.currency, 'due_at', v_order.payment_due_at,
      'shop_name', s.name,
      'customer', jsonb_build_object('name', c.full_name, 'email', c.email::text,
                                     'phone', coalesce(c.phone, v_order.shipping_address ->> 'phone')))
    from public.shops s left join public.customers c on c.id = v_order.customer_id
    where s.id = v_order.shop_id);
end;
$$;

create or replace function public.record_payment_attempt(
  p_order_id uuid, p_provider_order_id text, p_amount numeric, p_currency text
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.payments (organization_id, order_id, provider_order_id, amount, currency)
  select organization_id, id, p_provider_order_id, p_amount, p_currency from public.orders where id = p_order_id
  returning id;
$$;

-- A captured payment (from the checkout callback or the webhook). Idempotent.
-- result: confirmed | already_recorded | duplicate | order_closed | amount_mismatch | unknown
create or replace function public.record_payment_captured(
  p_provider_order_id   text,
  p_provider_payment_id text,
  p_amount              numeric,
  p_method              text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_order   public.orders;
  v_result  text;
begin
  select * into v_payment from public.payments where provider_order_id = p_provider_order_id for update;
  if v_payment.id is null then
    return jsonb_build_object('result', 'unknown');
  end if;
  select * into v_order from public.orders where id = v_payment.order_id for update;

  if v_payment.status <> 'created' and v_payment.status <> 'failed' then
    return jsonb_build_object('result', 'already_recorded', 'order_id', v_order.id, 'payment_id', v_payment.id);
  end if;

  v_result := case
    when round(p_amount, 2) <> round(v_payment.amount, 2) then 'amount_mismatch'
    when v_order.payment_status = 'paid' then 'duplicate'
    when v_order.status <> 'pending' then 'order_closed'
    else 'confirmed'
  end;

  update public.payments
  set status = 'captured', provider_payment_id = p_provider_payment_id, method = p_method,
      amount = round(p_amount, 2), captured_at = now(), error = null,
      refund_due = v_result <> 'confirmed'
  where id = v_payment.id;

  if v_result = 'confirmed' then
    update public.orders
    set payment_status = 'paid', paid_at = now(), payment_method = private.payment_method_from(p_method),
        status = 'confirmed', confirmed_at = now(), payment_due_at = null
    where id = v_order.id;
    perform private.add_order_event(v_order.organization_id, v_order.id, 'payment.paid',
      'Paid online' || coalesce(' by ' || upper(p_method), '') || ' (' || p_provider_payment_id || ')');
    perform private.add_order_event(v_order.organization_id, v_order.id, 'order.confirmed',
      'Confirmed after online payment');
  else
    perform private.add_order_event(v_order.organization_id, v_order.id, 'payment.refund_due',
      'Payment ' || p_provider_payment_id || ' received but ' ||
      case v_result when 'duplicate' then 'the order was already paid'
                    when 'order_closed' then 'the order was already cancelled'
                    else 'the amount didn''t match' end || '; refunding it');
  end if;

  return jsonb_build_object('result', v_result, 'order_id', v_order.id, 'payment_id', v_payment.id);
end;
$$;

create or replace function public.record_payment_failed(
  p_provider_order_id text, p_provider_payment_id text, p_reason text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  select * into v_payment from public.payments where provider_order_id = p_provider_order_id for update;
  if v_payment.id is null or v_payment.status <> 'created' then
    return;
  end if;
  update public.payments set status = 'failed', error = left(p_reason, 500),
    provider_payment_id = coalesce(provider_payment_id, p_provider_payment_id)
  where id = v_payment.id;
  perform private.add_order_event(v_payment.organization_id, v_payment.order_id, 'payment.failed',
    'Online payment failed' || coalesce(': ' || left(p_reason, 200), ''));
end;
$$;

-- Captured payments with money left to refund (after a cancel, duplicate, ...).
create or replace function public.payments_to_refund(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'payment_id', p.id, 'organization_id', p.organization_id,
           'provider_payment_id', p.provider_payment_id, 'amount', p.amount - p.refunded_amount)), '[]'::jsonb)
  from public.payments p
  join public.orders o on o.id = p.order_id
  where p.order_id = p_order_id
    and p.status in ('captured', 'partially_refunded')
    and p.amount > p.refunded_amount
    and (o.status = 'cancelled' or p.refund_due);
$$;

create or replace function public.record_refund(p_payment_id uuid, p_refund_id text, p_amount numeric)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_total   numeric;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  v_total := least(v_payment.refunded_amount + round(p_amount, 2), v_payment.amount);
  update public.payments
  set refunded_amount = v_total,
      status = case when v_total >= amount then 'refunded' else 'partially_refunded' end,
      refund_due = v_total < amount and refund_due
  where id = p_payment_id;

  -- The order's payment status follows what is still kept against its total:
  -- refunding an extra (duplicate) payment leaves a fully paid order paid.
  update public.orders o
  set payment_status = case
        when k.kept >= o.grand_total then 'paid'::public.payment_status
        when k.kept <= 0 then 'refunded'::public.payment_status
        else 'partially_refunded'::public.payment_status end
  from (select coalesce(sum(p.amount - p.refunded_amount), 0) as kept
        from public.payments p
        where p.order_id = v_payment.order_id and p.status in ('captured', 'partially_refunded', 'refunded')) k
  where o.id = v_payment.order_id and o.payment_status in ('paid', 'partially_refunded');

  perform private.add_order_event(v_payment.organization_id, v_payment.order_id, 'payment.refunded',
    'Refunded ' || round(p_amount, 2) || ' ' || v_payment.currency || ' (' || p_refund_id || ')');
end;
$$;

-- Webhooks may arrive more than once; true the first time an event is seen.
create or replace function public.register_webhook_event(p_event_id text, p_organization_id uuid, p_event text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into private.webhook_events (event_id, organization_id, event) values (p_event_id, p_organization_id, p_event);
  return true;
exception when unique_violation then
  return false;
end;
$$;

-- If handling an event fails, forget it so Razorpay's retry is processed.
create or replace function public.forget_webhook_event(p_event_id text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from private.webhook_events where event_id = p_event_id;
$$;

-- -----------------------------------------------------------------------------
-- Storefront reads: accepted methods, and payment state on the order page
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
-- Scheduling: expire unpaid orders every 5 minutes where pg_cron is enabled
-- (Supabase: Database → Extensions → pg_cron). The app also expires them
-- whenever someone tries to pay, so nothing depends on this.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('shopverse-expire-unpaid-orders', '*/5 * * * *', 'select public.expire_unpaid_orders()');
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function private.shop_accepts(public.shops, text) from public;
revoke all on function private.payment_method_from(text) from public;
revoke all on function private.hold_for_payment(uuid) from public;
revoke all on function private.price_checkout(public.shops, jsonb, text) from public;

revoke all on function public.get_payment_settings(uuid) from public, anon;
revoke all on function public.save_payment_account(uuid, text, text, text, boolean) from public, anon;
revoke all on function public.disconnect_payment_account(uuid) from public, anon;
grant execute on function public.get_payment_settings(uuid) to authenticated;
grant execute on function public.save_payment_account(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.disconnect_payment_account(uuid) to authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.payment_account_credentials(uuid)',
    'public.expire_unpaid_orders(uuid)',
    'public.begin_online_payment(text)',
    'public.record_payment_attempt(uuid, text, numeric, text)',
    'public.record_payment_captured(text, text, numeric, text)',
    'public.record_payment_failed(text, text, text)',
    'public.payments_to_refund(uuid)',
    'public.record_refund(uuid, text, numeric)',
    'public.register_webhook_event(text, uuid, text)',
    'public.forget_webhook_event(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
