-- =============================================================================
-- Shopverse · Migration 026 · Brand and reach
--
--  * Brand: each shop's logo, colour and homepage banners live in
--    shops.settings -> 'branding', written through save_shop_branding.
--  * Custom domains: a shop claims a domain, proves it with a DNS TXT record
--    (checked by the server), and is then served there. shop_for_domain maps
--    a verified domain back to the shop for the proxy.
--  * Order updates by WhatsApp or SMS: each business connects a provider
--    (Twilio, or the built-in test outbox). Shoppers opt in at checkout;
--    every message sent is logged.
--  * Abandoned carts: checkouts that weren't finished, and signed-in shoppers'
--    carts, become cart_recoveries. One reminder email goes out after a delay
--    the shop chooses; an order from the same email closes the cart (and
--    counts as recovered when it was reminded).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Brand
-- -----------------------------------------------------------------------------
/*
 * p_branding: { color, logo: { path, width, height } | null,
 *               banners: [{ id, path, width, height, headline, subtext, link, alt }] }
 */
create or replace function public.save_shop_branding(p_shop_id uuid, p_branding jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop    public.shops;
  v_banner  jsonb;
  v_prefix  text;
begin
  select * into v_shop from public.shops where id = p_shop_id for update;
  if v_shop.id is null then
    raise exception 'Shop not found' using errcode = 'no_data_found';
  end if;
  if not private.has_org_role(v_shop.organization_id, array['owner', 'admin']::public.org_role[]) then
    raise exception 'Only owners and admins can change the shop''s brand' using errcode = '42501';
  end if;
  if jsonb_typeof(p_branding) <> 'object' then
    raise exception 'Invalid brand settings' using errcode = 'check_violation';
  end if;
  if coalesce(p_branding ->> 'color', '') !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Choose a colour like #1d6b5c' using errcode = 'check_violation';
  end if;
  -- Images must be this shop's own uploads.
  v_prefix := v_shop.organization_id::text || '/shops/' || v_shop.id::text || '/';
  if jsonb_typeof(p_branding -> 'logo') = 'object'
     and not starts_with(coalesce(p_branding -> 'logo' ->> 'path', ''), v_prefix) then
    raise exception 'Invalid logo' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(coalesce(p_branding -> 'banners', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_branding -> 'banners', '[]'::jsonb)) > 5 then
    raise exception 'A shop can have up to 5 banners' using errcode = 'check_violation';
  end if;
  for v_banner in select * from jsonb_array_elements(coalesce(p_branding -> 'banners', '[]'::jsonb)) loop
    if not starts_with(coalesce(v_banner ->> 'path', ''), v_prefix) then
      raise exception 'Invalid banner image' using errcode = 'check_violation';
    end if;
    if char_length(coalesce(v_banner ->> 'headline', '')) > 80
       or char_length(coalesce(v_banner ->> 'subtext', '')) > 160
       or char_length(coalesce(v_banner ->> 'alt', '')) > 200 then
      raise exception 'Banner text is too long' using errcode = 'check_violation';
    end if;
    -- Links stay inside the shop (relative) or go to https pages.
    if coalesce(v_banner ->> 'link', '') <> ''
       and (v_banner ->> 'link') !~ '^(/[^/\\]|https://)' then
      raise exception 'Banner links must start with / or https://' using errcode = 'check_violation';
    end if;
  end loop;

  update public.shops
  set settings = jsonb_set(settings, '{branding}', jsonb_build_object(
        'color', lower(p_branding ->> 'color'),
        'logo', case when jsonb_typeof(p_branding -> 'logo') = 'object' then p_branding -> 'logo' end,
        'banners', coalesce(p_branding -> 'banners', '[]'::jsonb)))
  where id = p_shop_id;

  perform private.log_audit(v_shop.organization_id, 'shop.branding_updated', 'shop', v_shop.id,
    jsonb_build_object('color', lower(p_branding ->> 'color'),
                       'logo', jsonb_typeof(p_branding -> 'logo') = 'object',
                       'banners', jsonb_array_length(coalesce(p_branding -> 'banners', '[]'::jsonb))));
end;
$$;

-- -----------------------------------------------------------------------------
-- Custom domains
-- -----------------------------------------------------------------------------
alter table public.shops
  add column domain_token       text,
  add column domain_verified_at timestamptz;

-- Hostnames only: labels of letters, digits and hyphens, at least one dot.
create or replace function private.valid_hostname(p_host text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_host ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' and char_length(p_host) <= 253;
$$;

/*
 * Claim a domain for a shop (owner or admin). Returns the TXT value to add at
 * _shopverse.<domain>. Changing the domain starts verification again.
 */
create or replace function public.set_shop_domain(p_shop_id uuid, p_domain text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop   public.shops;
  v_domain text := lower(trim(trailing '.' from btrim(coalesce(p_domain, ''))));
  v_token  text;
begin
  select * into v_shop from public.shops where id = p_shop_id for update;
  if v_shop.id is null then
    raise exception 'Shop not found' using errcode = 'no_data_found';
  end if;
  if not private.has_org_role(v_shop.organization_id, array['owner', 'admin']::public.org_role[]) then
    raise exception 'Only owners and admins can change the domain' using errcode = '42501';
  end if;
  if not private.valid_hostname(v_domain) then
    raise exception 'Enter a domain like shop.example.com' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.shops where lower(custom_domain::text) = v_domain and id <> p_shop_id) then
    raise exception 'Another shop already uses this domain' using errcode = 'unique_violation';
  end if;
  if lower(v_shop.custom_domain::text) = v_domain and v_shop.domain_token is not null then
    return v_shop.domain_token;
  end if;
  v_token := 'shopverse-verify=' || encode(extensions.gen_random_bytes(16), 'hex');
  update public.shops
  set custom_domain = v_domain, domain_token = v_token, domain_verified_at = null
  where id = p_shop_id;
  perform private.log_audit(v_shop.organization_id, 'shop.domain_set', 'shop', v_shop.id,
    jsonb_build_object('domain', v_domain));
  return v_token;
end;
$$;

create or replace function public.remove_shop_domain(p_shop_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop public.shops;
begin
  select * into v_shop from public.shops where id = p_shop_id for update;
  if v_shop.id is null then
    raise exception 'Shop not found' using errcode = 'no_data_found';
  end if;
  if not private.has_org_role(v_shop.organization_id, array['owner', 'admin']::public.org_role[]) then
    raise exception 'Only owners and admins can change the domain' using errcode = '42501';
  end if;
  update public.shops set custom_domain = null, domain_token = null, domain_verified_at = null where id = p_shop_id;
  perform private.log_audit(v_shop.organization_id, 'shop.domain_removed', 'shop', v_shop.id,
    jsonb_build_object('domain', v_shop.custom_domain));
end;
$$;

-- Service role, after the server has found the TXT record.
create or replace function public.mark_shop_domain_verified(p_shop_id uuid, p_domain text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop public.shops;
begin
  update public.shops set domain_verified_at = now()
  where id = p_shop_id and lower(custom_domain::text) = lower(p_domain) and domain_token is not null
  returning * into v_shop;
  if v_shop.id is not null then
    perform private.log_audit(v_shop.organization_id, 'shop.domain_verified', 'shop', v_shop.id,
      jsonb_build_object('domain', v_shop.custom_domain));
  end if;
  return v_shop.id is not null;
end;
$$;

-- Anyone (the proxy): which shop a verified domain serves.
create or replace function public.shop_for_domain(p_host text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select slug from public.shops
  where lower(custom_domain::text) = lower(split_part(p_host, ':', 1))
    and domain_verified_at is not null and status = 'live';
$$;

-- -----------------------------------------------------------------------------
-- WhatsApp and SMS
-- -----------------------------------------------------------------------------
create table private.messaging_accounts (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  provider        text not null check (provider in ('test', 'twilio')),
  channel         text not null check (channel in ('whatsapp', 'sms')),
  -- Twilio: account SID, the encrypted auth token, and the sender.
  account_sid     text check (account_sid is null or account_sid ~ '^AC[0-9a-fA-F]{32}$'),
  auth_token_enc  text,
  sender          text check (sender is null or sender ~ '^\+[1-9][0-9]{6,14}$'),
  events          text[] not null default array['confirmed', 'shipped', 'out_for_delivery', 'delivered']
                  check (events <@ array['confirmed', 'shipped', 'out_for_delivery', 'delivery_failed', 'delivered', 'cancelled']),
  enabled         boolean not null default true,
  updated_by      uuid references auth.users (id) on delete set null,
  updated_at      timestamptz not null default now(),
  constraint messaging_twilio_complete check (
    provider <> 'twilio' or (account_sid is not null and auth_token_enc is not null and sender is not null))
);

alter table public.orders add column message_opt_in boolean not null default false;
grant select (message_opt_in) on public.orders to authenticated;

create table public.message_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_id        uuid references public.orders (id) on delete set null,
  channel         text not null check (channel in ('whatsapp', 'sms')),
  provider        text not null,
  event           text not null,
  to_phone        text not null,
  body            text not null check (char_length(body) <= 1600),
  status          text not null check (status in ('sent', 'failed')),
  provider_id     text,
  error           text check (error is null or char_length(error) <= 500),
  created_at      timestamptz not null default now()
);

create index message_log_org_idx on public.message_log (organization_id, created_at desc);

alter table public.message_log enable row level security;
create policy "message log: owners and admins read" on public.message_log
  for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager', 'support']::public.org_role[]));
revoke all on public.message_log from anon;
revoke insert, update, delete, truncate on public.message_log from authenticated;

create or replace function public.get_messaging_settings(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account private.messaging_accounts;
begin
  if not private.has_org_role(p_organization_id, array['owner', 'admin']::public.org_role[]) then
    raise exception 'Only owners and admins can see messaging settings' using errcode = '42501';
  end if;
  select * into v_account from private.messaging_accounts where organization_id = p_organization_id;
  if v_account.organization_id is null then
    return jsonb_build_object('connected', false);
  end if;
  return jsonb_build_object(
    'connected', true, 'provider', v_account.provider, 'channel', v_account.channel,
    'account_sid', v_account.account_sid, 'sender', v_account.sender,
    'token_saved', v_account.auth_token_enc is not null,
    'events', to_jsonb(v_account.events), 'enabled', v_account.enabled, 'updated_at', v_account.updated_at);
end;
$$;

-- Null token keeps the saved one. The server checks Twilio keys before saving.
create or replace function public.save_messaging_settings(
  p_organization_id uuid,
  p_provider        text,
  p_channel         text,
  p_events          text[],
  p_enabled         boolean,
  p_account_sid     text default null,
  p_auth_token_enc  text default null,
  p_sender          text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_org_role(p_organization_id, array['owner', 'admin']::public.org_role[]) then
    raise exception 'Only owners and admins can change messaging' using errcode = '42501';
  end if;
  insert into private.messaging_accounts (organization_id, provider, channel, account_sid, auth_token_enc,
                                          sender, events, enabled, updated_by)
  values (p_organization_id, p_provider, p_channel,
          case when p_provider = 'twilio' then p_account_sid end,
          case when p_provider = 'twilio' then coalesce(p_auth_token_enc,
            (select a.auth_token_enc from private.messaging_accounts a where a.organization_id = p_organization_id)) end,
          case when p_provider = 'twilio' then p_sender end,
          coalesce(p_events, '{}'), coalesce(p_enabled, true), auth.uid())
  on conflict (organization_id) do update
    set provider = excluded.provider, channel = excluded.channel,
        account_sid = excluded.account_sid,
        auth_token_enc = excluded.auth_token_enc,
        sender = excluded.sender, events = excluded.events, enabled = excluded.enabled,
        updated_by = excluded.updated_by, updated_at = now();
  perform private.log_audit(p_organization_id, 'messaging.updated', 'messaging', p_organization_id,
    jsonb_build_object('provider', p_provider, 'channel', p_channel, 'enabled', p_enabled,
                       'events', to_jsonb(p_events), 'token_changed', p_auth_token_enc is not null));
end;
$$;

create or replace function public.disconnect_messaging(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_org_role(p_organization_id, array['owner', 'admin']::public.org_role[]) then
    raise exception 'Only owners and admins can change messaging' using errcode = '42501';
  end if;
  delete from private.messaging_accounts where organization_id = p_organization_id;
  perform private.log_audit(p_organization_id, 'messaging.disconnected', 'messaging', p_organization_id, '{}'::jsonb);
end;
$$;

-- Service role: credentials and the order's details for one message.
create or replace function public.messaging_account(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('provider', provider, 'channel', channel, 'account_sid', account_sid,
                            'auth_token_enc', auth_token_enc, 'sender', sender,
                            'events', to_jsonb(events), 'enabled', enabled)
  from private.messaging_accounts where organization_id = p_organization_id;
$$;

create or replace function public.record_message(
  p_organization_id uuid, p_order_id uuid, p_channel text, p_provider text, p_event text,
  p_to text, p_body text, p_status text, p_provider_id text default null, p_error text default null
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.message_log (organization_id, order_id, channel, provider, event, to_phone, body,
                                  status, provider_id, error)
  values (p_organization_id, p_order_id, p_channel, p_provider, p_event, p_to, left(p_body, 1600),
          p_status, p_provider_id, left(p_error, 500))
  returning id;
$$;

-- A guest checkout that asked for updates carries the choice to its order.
create or replace function private.checkout_message_opt_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.order_id is not null and old.order_id is null
     and coalesce((new.contact ->> 'message_opt_in')::boolean, false) then
    update public.orders set message_opt_in = true where id = new.order_id;
  end if;
  return null;
end;
$$;

create trigger checkout_sessions_message_opt_in
  after update of order_id on private.checkout_sessions
  for each row execute function private.checkout_message_opt_in();

-- Which channel the storefront may offer at checkout (null: none).
create or replace function private.shop_message_channel(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select channel from private.messaging_accounts where organization_id = p_organization_id and enabled;
$$;

-- -----------------------------------------------------------------------------
-- Abandoned carts
-- -----------------------------------------------------------------------------
create table public.cart_recoveries (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  shop_id            uuid not null references public.shops (id) on delete cascade,
  email              extensions.citext not null,
  name               text,
  -- [{ variant_id, quantity }]
  lines              jsonb not null check (jsonb_typeof(lines) = 'array'),
  subtotal           numeric(12, 2) not null default 0,
  source             text not null check (source in ('checkout', 'account')),
  status             text not null default 'open' check (status in ('open', 'reminded', 'recovered', 'closed')),
  token              text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  last_activity_at   timestamptz not null default now(),
  reminded_at        timestamptz,
  clicked_at         timestamptz,
  recovered_order_id uuid references public.orders (id) on delete set null,
  closed_at          timestamptz,
  created_at         timestamptz not null default now()
);

-- One cart in progress per shopper and shop.
create unique index cart_recoveries_open_uidx on public.cart_recoveries (shop_id, email) where status = 'open';
create index cart_recoveries_due_idx on public.cart_recoveries (last_activity_at) where status = 'open';
create index cart_recoveries_org_idx on public.cart_recoveries (organization_id, created_at desc);

alter table public.cart_recoveries enable row level security;
create policy "cart recoveries: managers read" on public.cart_recoveries
  for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]));
revoke all on public.cart_recoveries from anon;
revoke insert, update, delete, truncate on public.cart_recoveries from authenticated;
-- Staff never need the restore token.
revoke select on public.cart_recoveries from authenticated;
grant select (id, organization_id, shop_id, email, name, lines, subtotal, source, status, last_activity_at,
              reminded_at, clicked_at, recovered_order_id, closed_at, created_at)
  on public.cart_recoveries to authenticated;

create table private.cart_reminder_optouts (
  shop_id    uuid not null references public.shops (id) on delete cascade,
  email      extensions.citext not null,
  created_at timestamptz not null default now(),
  primary key (shop_id, email)
);

create or replace function private.track_cart(
  p_shop_id uuid, p_email text, p_name text, p_lines jsonb, p_subtotal numeric, p_source text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.shops where id = p_shop_id;
  if v_org is null or p_email is null then
    return;
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    update public.cart_recoveries set status = 'closed', closed_at = now()
    where shop_id = p_shop_id and lower(email::text) = lower(p_email) and status = 'open';
    return;
  end if;
  insert into public.cart_recoveries (organization_id, shop_id, email, name, lines, subtotal, source)
  values (v_org, p_shop_id, lower(p_email), nullif(btrim(p_name), ''), p_lines, coalesce(p_subtotal, 0), p_source)
  on conflict (shop_id, email) where status = 'open'
  do update set lines = excluded.lines, subtotal = excluded.subtotal, source = excluded.source,
                name = coalesce(excluded.name, public.cart_recoveries.name), last_activity_at = now();
end;
$$;

-- A guest who started checkout (entered their email) has a cart worth saving.
create or replace function private.checkout_track_cart()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.order_id is null then
    perform private.track_cart(new.shop_id, new.email::text, new.contact ->> 'name',
      (select coalesce(jsonb_agg(jsonb_build_object('variant_id', l ->> 'variant_id', 'quantity', (l ->> 'quantity')::int)), '[]'::jsonb)
       from jsonb_array_elements(new.lines) l),
      new.subtotal, 'checkout');
  end if;
  return null;
end;
$$;

create trigger checkout_sessions_track_cart
  after insert on private.checkout_sessions
  for each row execute function private.checkout_track_cart();

-- Service role: a signed-in shopper's cart changed (empty lines close it).
create or replace function public.shopper_track_cart(p_shop_id uuid, p_token text, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers;
  v_lines    jsonb := '[]'::jsonb;
  v_subtotal numeric := 0;
begin
  v_customer := private.shopper_customer(p_shop_id, p_token);
  if v_customer.id is null or v_customer.email is null then
    return;
  end if;
  if jsonb_typeof(p_lines) = 'array' then
    select coalesce(jsonb_agg(jsonb_build_object('variant_id', v.id, 'quantity', least(greatest((l ->> 'quantity')::int, 1), 20))), '[]'::jsonb),
           coalesce(sum(v.price * least(greatest((l ->> 'quantity')::int, 1), 20)), 0)
    into v_lines, v_subtotal
    from (select * from jsonb_array_elements(p_lines) limit 50) x(l)
    join public.product_variants v on v.id = (l ->> 'variant_id')::uuid and v.is_active
    join public.shops sh on sh.id = p_shop_id and sh.organization_id = v.organization_id;
  end if;
  perform private.track_cart(p_shop_id, v_customer.email::text, v_customer.full_name, v_lines, v_subtotal, 'account');
end;
$$;

-- An order from the same shopper closes the cart: recovered if we reminded them.
create or replace function private.orders_close_cart()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  select email::text into v_email from public.customers where id = new.customer_id;
  if v_email is null then
    return null;
  end if;
  update public.cart_recoveries
  set status = case when status = 'reminded' then 'recovered' else 'closed' end,
      recovered_order_id = case when status = 'reminded' then new.id end,
      closed_at = now()
  where shop_id = new.shop_id and lower(email::text) = lower(v_email)
    and (status = 'open' or (status = 'reminded' and reminded_at > now() - interval '14 days'));
  return null;
end;
$$;

create trigger orders_close_cart
  after insert on public.orders
  for each row execute function private.orders_close_cart();

/*
 * Service role: carts idle longer than their shop's delay, in shops with
 * reminders on, not opted out and not ordered since. Marks them reminded
 * first; returns what the email needs.
 */
create or replace function public.claim_cart_reminders(p_now timestamptz default now())
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  -- Opted out: close quietly.
  update public.cart_recoveries r set status = 'closed', closed_at = p_now
  where r.status = 'open'
    and exists (select 1 from private.cart_reminder_optouts o where o.shop_id = r.shop_id and lower(o.email::text) = lower(r.email::text));

  with due as (
    update public.cart_recoveries r
    set status = 'reminded', reminded_at = p_now
    from public.shops sh
    where sh.id = r.shop_id and r.status = 'open'
      and sh.status = 'live'
      and coalesce((sh.settings ->> 'cart_reminders')::boolean, false)
      and r.last_activity_at <= p_now - make_interval(hours => coalesce((sh.settings ->> 'cart_reminder_hours')::int, 3))
      -- Too old to be worth a reminder.
      and r.last_activity_at > p_now - interval '7 days'
    returning r.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'organization_id', d.organization_id, 'email', d.email, 'name', d.name, 'token', d.token,
    'subtotal', d.subtotal,
    'shop', jsonb_build_object('name', sh.name, 'slug', sh.slug, 'support_email', sh.settings ->> 'support_email',
                               'color', sh.settings -> 'branding' ->> 'color'),
    'discount_code', (select dc.code::text from public.discounts dc
                      where dc.organization_id = d.organization_id and dc.is_active
                        and lower(dc.code::text) = lower(sh.settings ->> 'cart_reminder_code')
                        and (dc.ends_at is null or dc.ends_at > p_now)),
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                'title', p.title || case when v.title <> 'Default' then ' · ' || v.title else '' end,
                'quantity', (l ->> 'quantity')::int, 'price', v.price,
                'image', (select i.organization_id::text || '/' || i.product_id::text || '/' || i.id::text
                          from public.product_images i where i.product_id = p.id
                          order by i.sort_order, i.created_at limit 1))), '[]'::jsonb)
              from jsonb_array_elements(d.lines) l
              join public.product_variants v on v.id = (l ->> 'variant_id')::uuid
              join public.products p on p.id = v.product_id)
  )), '[]'::jsonb)
  into v_result
  from due d join public.shops sh on sh.id = d.shop_id;
  return v_result;
end;
$$;

-- Service role: put a reminder back when its email failed.
create or replace function public.release_cart_reminder(p_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.cart_recoveries set status = 'open', reminded_at = null where id = p_id and status = 'reminded';
$$;

-- Service role: the restore link. Returns the shop and the lines still for sale.
create or replace function public.cart_recovery_restore(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cart public.cart_recoveries;
  v_shop public.shops;
begin
  if p_token !~ '^[0-9a-f]{48}$' then
    return null;
  end if;
  select * into v_cart from public.cart_recoveries where token = p_token and created_at > now() - interval '30 days';
  if v_cart.id is null then
    return null;
  end if;
  select * into v_shop from public.shops where id = v_cart.shop_id;
  update public.cart_recoveries set clicked_at = coalesce(clicked_at, now()) where id = v_cart.id;
  return jsonb_build_object(
    'shop_slug', v_shop.slug,
    'discount_code', nullif(v_shop.settings ->> 'cart_reminder_code', ''),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('variantId', v.id, 'quantity', (l ->> 'quantity')::int)), '[]'::jsonb)
              from jsonb_array_elements(v_cart.lines) l
              join private.storefront_products(v_shop.id) p on true
              join public.product_variants v on v.product_id = p.id and v.is_active and v.id = (l ->> 'variant_id')::uuid));
end;
$$;

-- Service role: "don't remind me" from the email.
create or replace function public.cart_reminder_optout(p_token text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cart public.cart_recoveries;
begin
  if p_token !~ '^[0-9a-f]{48}$' then
    return null;
  end if;
  select * into v_cart from public.cart_recoveries where token = p_token;
  if v_cart.id is null then
    return null;
  end if;
  insert into private.cart_reminder_optouts (shop_id, email) values (v_cart.shop_id, lower(v_cart.email::text))
  on conflict do nothing;
  update public.cart_recoveries set status = 'closed', closed_at = now()
  where shop_id = v_cart.shop_id and lower(email::text) = lower(v_cart.email::text) and status = 'open';
  return (select name from public.shops where id = v_cart.shop_id);
end;
$$;

-- Reminder settings, per shop (owner or admin). The code must be an active discount code.
create or replace function public.save_cart_reminder_settings(
  p_shop_id uuid, p_enabled boolean, p_delay_hours integer, p_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop public.shops;
  v_code text := nullif(btrim(coalesce(p_code, '')), '');
begin
  select * into v_shop from public.shops where id = p_shop_id for update;
  if v_shop.id is null then
    raise exception 'Shop not found' using errcode = 'no_data_found';
  end if;
  if not private.has_org_role(v_shop.organization_id, array['owner', 'admin', 'manager']::public.org_role[]) then
    raise exception 'Only owners, admins and managers can change cart reminders' using errcode = '42501';
  end if;
  if p_delay_hours not in (1, 3, 6, 12, 24) then
    raise exception 'Choose 1, 3, 6, 12 or 24 hours' using errcode = 'check_violation';
  end if;
  if v_code is not null and not exists (
      select 1 from public.discounts where organization_id = v_shop.organization_id and is_active
        and lower(code::text) = lower(v_code) and (ends_at is null or ends_at > now())
        and (shop_ids is null or v_shop.id = any (shop_ids))) then
    raise exception 'That discount code isn''t active for this shop' using errcode = 'check_violation';
  end if;
  update public.shops
  set settings = settings || jsonb_build_object('cart_reminders', coalesce(p_enabled, false),
                                                'cart_reminder_hours', p_delay_hours)
                 || case when v_code is null then '{}'::jsonb else jsonb_build_object('cart_reminder_code', upper(v_code)) end
                 - case when v_code is null then 'cart_reminder_code' else '' end
  where id = p_shop_id;
  perform private.log_audit(v_shop.organization_id, 'shop.cart_reminders_updated', 'shop', v_shop.id,
    jsonb_build_object('enabled', p_enabled, 'hours', p_delay_hours, 'code', v_code));
end;
$$;

-- Marketing page numbers: carts, reminders, recoveries (last p_days days).
create or replace function public.cart_recovery_stats(p_organization_id uuid, p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when not private.has_org_role(p_organization_id, array['owner', 'admin', 'manager']::public.org_role[])
    then null else jsonb_build_object(
      'abandoned', count(*) filter (where r.status in ('reminded', 'recovered') or (r.status = 'open' and r.last_activity_at < now() - interval '1 hour')),
      'reminded', count(*) filter (where r.reminded_at is not null),
      'clicked', count(*) filter (where r.clicked_at is not null),
      'recovered', count(*) filter (where r.status = 'recovered'),
      'recovered_total', coalesce(sum(o.grand_total) filter (where r.status = 'recovered' and o.status <> 'cancelled'), 0))
  end
  from public.cart_recoveries r
  left join public.orders o on o.id = r.recovered_order_id
  where r.organization_id = p_organization_id and r.created_at > now() - make_interval(days => greatest(p_days, 1));
$$;

-- -----------------------------------------------------------------------------
-- The storefront sees the brand, its verified domain and the update channel.
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
      where private.shop_accepts(v_shop, m)),
    'branding', v_shop.settings -> 'branding',
    'domain', case when v_shop.domain_verified_at is not null then v_shop.custom_domain::text end,
    'message_channel', private.shop_message_channel(v_shop.organization_id)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function public.save_shop_branding(uuid, jsonb) from public, anon;
revoke all on function public.set_shop_domain(uuid, text) from public, anon;
revoke all on function public.remove_shop_domain(uuid) from public, anon;
revoke all on function public.get_messaging_settings(uuid) from public, anon;
revoke all on function public.save_messaging_settings(uuid, text, text, text[], boolean, text, text, text) from public, anon;
revoke all on function public.disconnect_messaging(uuid) from public, anon;
revoke all on function public.save_cart_reminder_settings(uuid, boolean, integer, text) from public, anon;
revoke all on function public.cart_recovery_stats(uuid, integer) from public, anon;
grant execute on function public.save_shop_branding(uuid, jsonb) to authenticated;
grant execute on function public.set_shop_domain(uuid, text) to authenticated;
grant execute on function public.remove_shop_domain(uuid) to authenticated;
grant execute on function public.get_messaging_settings(uuid) to authenticated;
grant execute on function public.save_messaging_settings(uuid, text, text, text[], boolean, text, text, text) to authenticated;
grant execute on function public.disconnect_messaging(uuid) to authenticated;
grant execute on function public.save_cart_reminder_settings(uuid, boolean, integer, text) to authenticated;
grant execute on function public.cart_recovery_stats(uuid, integer) to authenticated;

revoke all on function public.shop_for_domain(text) from public;
grant execute on function public.shop_for_domain(text) to anon, authenticated, service_role;

revoke all on function public.mark_shop_domain_verified(uuid, text) from public, anon, authenticated;
revoke all on function public.messaging_account(uuid) from public, anon, authenticated;
revoke all on function public.record_message(uuid, uuid, text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.shopper_track_cart(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.claim_cart_reminders(timestamptz) from public, anon, authenticated;
revoke all on function public.release_cart_reminder(uuid) from public, anon, authenticated;
revoke all on function public.cart_recovery_restore(text) from public, anon, authenticated;
revoke all on function public.cart_reminder_optout(text) from public, anon, authenticated;
grant execute on function public.mark_shop_domain_verified(uuid, text) to service_role;
grant execute on function public.messaging_account(uuid) to service_role;
grant execute on function public.record_message(uuid, uuid, text, text, text, text, text, text, text, text) to service_role;
grant execute on function public.shopper_track_cart(uuid, text, jsonb) to service_role;
grant execute on function public.claim_cart_reminders(timestamptz) to service_role;
grant execute on function public.release_cart_reminder(uuid) to service_role;
grant execute on function public.cart_recovery_restore(text) to service_role;
grant execute on function public.cart_reminder_optout(text) to service_role;
revoke all on function private.track_cart(uuid, text, text, jsonb, numeric, text) from public;
