-- =============================================================================
-- Shopverse · Migration 022 · Shopverse billing and the platform admin console
--
--  * Businesses subscribe to a plan (monthly or yearly) through Shopverse's
--    own Razorpay account (Razorpay Subscriptions). The app talks to Razorpay;
--    these functions record what happened and keep the organisation's plan in
--    step. They run only with the service role.
--  * Every charge gets a numbered GST tax invoice from Shopverse to the
--    business (SV<FY>-00001, one series for the platform).
--  * A failed renewal starts a 7-day grace period; after it, growth is blocked
--    as when a trial ends. Selling, orders and stock are never blocked.
--  * Upgrades apply at once; downgrades and switching to yearly or monthly
--    wait for the renewal, and only when the business fits the smaller plan.
--  * Platform admins (private.platform_admins) see every business, extend
--    trials and set plans by hand. Every admin change is audited on the
--    business.
--  * Fix: owners and admins could update any organisations column through
--    the API, including the plan. Only the name is editable now.
-- =============================================================================

revoke update on public.organizations from authenticated;
grant update (name) on public.organizations to authenticated;

alter table public.organizations
  add column plan_interval  text check (plan_interval in ('monthly', 'yearly')),
  add column plan_renews_at timestamptz,
  add column past_due_since timestamptz,
  -- Who Shopverse invoices: legal_name, gstin, email, line1, city, state, postal_code.
  add column billing_profile jsonb not null default '{}'::jsonb;

create table private.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table private.platform_counters (
  name  text primary key,
  value bigint not null default 0
);

-- Razorpay plans created on first use, one per plan, interval and price.
create table private.platform_provider_plans (
  plan             public.plan_tier not null,
  interval         text not null check (interval in ('monthly', 'yearly')),
  -- Price per period before GST, and what Razorpay charges (GST included).
  amount           numeric(12, 2) not null check (amount > 0),
  charge_amount    numeric(12, 2) not null check (charge_amount > 0),
  provider_plan_id text not null unique,
  created_at       timestamptz not null default now(),
  primary key (plan, interval, amount)
);

create table private.platform_webhook_events (
  event_id    text primary key,
  event       text not null,
  received_at timestamptz not null default now()
);

create table public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete cascade,
  provider                 text not null default 'razorpay',
  provider_subscription_id text not null unique,
  plan                     public.plan_tier not null check (plan <> 'trial'),
  interval                 text not null check (interval in ('monthly', 'yearly')),
  -- Price per period before GST, and what is charged (GST included).
  base_amount              numeric(12, 2) not null check (base_amount > 0),
  amount                   numeric(12, 2) not null check (amount > 0),
  status                   text not null default 'created'
                           check (status in ('created', 'authenticated', 'active', 'pending', 'halted',
                                             'cancelled', 'completed', 'expired')),
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean not null default false,
  scheduled_plan           public.plan_tier check (scheduled_plan is null or scheduled_plan <> 'trial'),
  scheduled_interval       text check (scheduled_interval in ('monthly', 'yearly')),
  scheduled_base_amount    numeric(12, 2),
  scheduled_amount         numeric(12, 2),
  short_url                text,
  ended_at                 timestamptz,
  created_by               uuid references auth.users (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- One subscription going ahead per business.
create unique index subscriptions_one_live_idx on public.subscriptions (organization_id)
  where status in ('authenticated', 'active', 'pending', 'halted');
create index subscriptions_org_idx on public.subscriptions (organization_id, created_at desc);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function private.set_updated_at();

create table public.platform_invoices (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  subscription_id     uuid references public.subscriptions (id) on delete set null,
  number              text not null unique,
  provider_payment_id text not null unique,
  plan                public.plan_tier not null,
  interval            text not null,
  period_start        timestamptz,
  period_end          timestamptz,
  taxable             numeric(12, 2) not null,
  gst_rate            numeric(5, 2) not null,
  cgst                numeric(12, 2) not null default 0,
  sgst                numeric(12, 2) not null default 0,
  igst                numeric(12, 2) not null default 0,
  total               numeric(12, 2) not null,
  sac_code            text,
  seller              jsonb not null,
  buyer               jsonb not null,
  issued_at           timestamptz not null default now()
);

create index platform_invoices_org_idx on public.platform_invoices (organization_id, issued_at desc);

alter table public.subscriptions enable row level security;
alter table public.platform_invoices enable row level security;
create policy "subscriptions: owners and admins read" on public.subscriptions
  for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));
create policy "platform invoices: owners and admins read" on public.platform_invoices
  for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));
revoke insert, update, delete on public.subscriptions, public.platform_invoices from authenticated, anon;
grant select on public.subscriptions, public.platform_invoices to authenticated;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.platform_admins where user_id = auth.uid());
$$;

create or replace function private.next_platform_counter(p_name text)
returns bigint
language sql
volatile
security definer
set search_path = ''
as $$
  insert into private.platform_counters (name, value) values (p_name, 1)
  on conflict (name) do update set value = private.platform_counters.value + 1
  returning value;
$$;

-- Resources a business uses beyond a plan's limits (to block downgrades that don't fit).
create or replace function private.plan_overages(p_organization_id uuid, p_plan public.plan_tier)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('resource', l.key, 'used', (u.usage ->> l.key)::integer,
                                               'limit', (l.value)::text::integer)), '[]'::jsonb)
  from jsonb_each(private.plan_limits(p_plan)) l
  cross join (select private.org_usage(p_organization_id) as usage) u
  where jsonb_typeof(l.value) = 'number' and (u.usage ->> l.key)::integer > (l.value)::text::integer;
$$;

-- Limits: an ended trial, or a failed payment past its 7-day grace, stops growth.
create or replace function private.check_plan_limit(p_organization_id uuid, p_resource text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   public.organizations;
  v_limit integer;
  v_used  integer;
  v_noun  text := case p_resource when 'seats' then 'team members' else p_resource end;
begin
  select * into v_org from public.organizations where id = p_organization_id;
  if v_org.id is null then
    return;
  end if;
  if v_org.plan = 'trial' and v_org.trial_ends_at < now() then
    raise exception 'Your free trial has ended. Choose a plan in Billing to add more %.', v_noun
      using errcode = 'check_violation';
  end if;
  if v_org.past_due_since is not null and v_org.past_due_since < now() - interval '7 days' then
    raise exception 'Your last payment for Shopverse didn''t go through. Update your payment in Billing to add more %.', v_noun
      using errcode = 'check_violation';
  end if;

  v_limit := (private.plan_limits(v_org.plan) ->> p_resource)::integer;
  if v_limit is null then
    return;
  end if;
  v_used := (private.org_usage(p_organization_id) ->> p_resource)::integer;
  if v_used >= v_limit then
    raise exception 'Your % plan includes % %. Upgrade in Billing to add more.', initcap(v_org.plan::text), v_limit, v_noun
      using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function private.subscription_json(p_sub public.subscriptions)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case when p_sub.id is null then null else jsonb_build_object(
    'id', p_sub.id, 'provider_subscription_id', p_sub.provider_subscription_id, 'plan', p_sub.plan,
    'interval', p_sub.interval, 'amount', p_sub.amount, 'base_amount', p_sub.base_amount, 'status', p_sub.status,
    'current_period_start', p_sub.current_period_start, 'current_period_end', p_sub.current_period_end,
    'cancel_at_period_end', p_sub.cancel_at_period_end, 'scheduled_plan', p_sub.scheduled_plan,
    'scheduled_interval', p_sub.scheduled_interval, 'short_url', p_sub.short_url) end;
$$;

-- The subscription going ahead (or the latest one).
create or replace function private.current_subscription(p_organization_id uuid)
returns public.subscriptions
language sql
stable
security definer
set search_path = ''
as $$
  select s.* from public.subscriptions s
  where s.organization_id = p_organization_id and s.status in ('authenticated', 'active', 'pending', 'halted')
  order by s.created_at desc limit 1;
$$;

create or replace function public.get_billing_overview(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
  v_sub public.subscriptions;
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'Organization not found' using errcode = 'no_data_found';
  end if;
  select * into v_org from public.organizations where id = p_organization_id;
  v_sub := private.current_subscription(p_organization_id);
  return jsonb_build_object(
    'plan', v_org.plan,
    'trial_ends_at', v_org.trial_ends_at,
    'trial_expired', v_org.plan = 'trial' and v_org.trial_ends_at < now(),
    'interval', v_org.plan_interval,
    'renews_at', v_org.plan_renews_at,
    'past_due_since', v_org.past_due_since,
    'grace_ends_at', v_org.past_due_since + interval '7 days',
    'had_subscription', exists (select 1 from public.subscriptions where organization_id = p_organization_id
                                and status in ('cancelled', 'completed', 'expired', 'active', 'authenticated', 'pending', 'halted')),
    'subscription', private.subscription_json(v_sub),
    'profile', case when private.has_org_role(p_organization_id, array['owner', 'admin']::public.org_role[])
                    then v_org.billing_profile else '{}'::jsonb end,
    'limits', private.plan_limits(v_org.plan),
    'usage', private.org_usage(p_organization_id),
    'plans', jsonb_build_object(
      'starter', private.plan_limits('starter'),
      'growth', private.plan_limits('growth'),
      'scale', private.plan_limits('scale')),
    'overages', jsonb_build_object(
      'starter', private.plan_overages(p_organization_id, 'starter'),
      'growth', private.plan_overages(p_organization_id, 'growth'),
      'scale', private.plan_overages(p_organization_id, 'scale'))
  );
end;
$$;

-- Owners: who Shopverse should invoice.
create or replace function public.save_billing_profile(p_organization_id uuid, p_profile jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gstin text := upper(nullif(btrim(p_profile ->> 'gstin'), ''));
begin
  if not private.has_org_role(p_organization_id, array['owner']::public.org_role[]) then
    raise exception 'Only owners can change billing details' using errcode = '42501';
  end if;
  if coalesce(btrim(p_profile ->> 'legal_name'), '') = '' or coalesce(btrim(p_profile ->> 'email'), '') = ''
     or coalesce(btrim(p_profile ->> 'state'), '') = '' then
    raise exception 'Enter the business name, billing email and state' using errcode = 'check_violation';
  end if;
  if v_gstin is not null and v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    raise exception 'Enter a valid 15-character GSTIN' using errcode = 'check_violation';
  end if;
  update public.organizations
  set billing_profile = jsonb_strip_nulls(jsonb_build_object(
        'legal_name', left(btrim(p_profile ->> 'legal_name'), 160),
        'gstin', v_gstin,
        'email', left(lower(btrim(p_profile ->> 'email')), 254),
        'line1', left(nullif(btrim(p_profile ->> 'line1'), ''), 200),
        'city', left(nullif(btrim(p_profile ->> 'city'), ''), 80),
        'state', left(btrim(p_profile ->> 'state'), 80),
        'postal_code', left(nullif(btrim(p_profile ->> 'postal_code'), ''), 6)))
  where id = p_organization_id;
  perform private.log_audit(p_organization_id, 'billing.updated', 'organization', p_organization_id,
    jsonb_build_object('gstin', v_gstin is not null));
end;
$$;

-- -----------------------------------------------------------------------------
-- Server: subscriptions (service role)
-- -----------------------------------------------------------------------------
create or replace function public.platform_provider_plan(p_plan public.plan_tier, p_interval text, p_amount numeric)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select provider_plan_id from private.platform_provider_plans
  where plan = p_plan and interval = p_interval and amount = p_amount;
$$;

create or replace function public.save_provider_plan(p_plan public.plan_tier, p_interval text, p_amount numeric,
                                                     p_charge_amount numeric, p_provider_plan_id text)
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  insert into private.platform_provider_plans (plan, interval, amount, charge_amount, provider_plan_id)
  values (p_plan, p_interval, p_amount, p_charge_amount, p_provider_plan_id)
  on conflict (plan, interval, amount) do update set plan = excluded.plan
  returning provider_plan_id;
$$;

create or replace function public.begin_subscription(
  p_organization_id uuid,
  p_user_id uuid,
  p_plan public.plan_tier,
  p_interval text,
  p_base_amount numeric,
  p_amount numeric,
  p_provider_subscription_id text,
  p_short_url text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if exists (select 1 from public.subscriptions where organization_id = p_organization_id
             and status in ('authenticated', 'active', 'pending', 'halted')) then
    raise exception 'This business already has a plan. Change it instead.' using errcode = 'check_violation';
  end if;
  -- Checkouts that were never completed.
  update public.subscriptions set status = 'expired', ended_at = now()
  where organization_id = p_organization_id and status = 'created';
  insert into public.subscriptions (organization_id, provider_subscription_id, plan, interval, base_amount, amount,
                                    short_url, created_by)
  values (p_organization_id, p_provider_subscription_id, p_plan, p_interval, p_base_amount, p_amount, p_short_url, p_user_id)
  returning id into v_id;
  return v_id;
end;
$$;

/*
 * Bring a subscription (and its business's plan) in line with Razorpay.
 * Idempotent: called after checkout, from webhooks and when staff look.
 */
create or replace function public.sync_subscription(
  p_provider_subscription_id text,
  p_status text,
  p_provider_plan_id text,
  p_current_start timestamptz default null,
  p_current_end timestamptz default null,
  p_short_url text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sub   public.subscriptions;
  v_pp    private.platform_provider_plans;
  v_prev  text;
begin
  select * into v_sub from public.subscriptions where provider_subscription_id = p_provider_subscription_id for update;
  if v_sub.id is null then
    return null;
  end if;
  v_prev := v_sub.status;
  if p_status not in ('created', 'authenticated', 'active', 'pending', 'halted', 'cancelled', 'completed', 'expired') then
    raise exception 'Unknown subscription status %', p_status using errcode = 'check_violation';
  end if;
  -- A finished subscription stays finished.
  if v_sub.status in ('cancelled', 'completed', 'expired') and p_status not in ('cancelled', 'completed', 'expired') then
    return private.subscription_json(v_sub);
  end if;

  select * into v_pp from private.platform_provider_plans where provider_plan_id = p_provider_plan_id;

  update public.subscriptions
  set status = p_status,
      plan = coalesce(v_pp.plan, plan),
      interval = coalesce(v_pp.interval, interval),
      base_amount = coalesce(v_pp.amount, base_amount),
      amount = coalesce(v_pp.charge_amount, amount),
      -- A scheduled change has happened once Razorpay reports the new plan.
      scheduled_plan = case when v_pp.plan = scheduled_plan and v_pp.interval = scheduled_interval then null else scheduled_plan end,
      scheduled_interval = case when v_pp.plan = scheduled_plan and v_pp.interval = scheduled_interval then null else scheduled_interval end,
      scheduled_amount = case when v_pp.plan = scheduled_plan and v_pp.interval = scheduled_interval then null else scheduled_amount end,
      scheduled_base_amount = case when v_pp.plan = scheduled_plan and v_pp.interval = scheduled_interval then null else scheduled_base_amount end,
      current_period_start = coalesce(p_current_start, current_period_start),
      current_period_end = coalesce(p_current_end, current_period_end),
      short_url = coalesce(p_short_url, short_url),
      ended_at = case when p_status in ('cancelled', 'completed', 'expired') then coalesce(ended_at, now()) end
  where id = v_sub.id
  returning * into v_sub;

  if p_status in ('authenticated', 'active') then
    update public.organizations
    set plan = v_sub.plan, plan_interval = v_sub.interval, plan_renews_at = v_sub.current_period_end,
        past_due_since = case when p_status = 'active' then null else past_due_since end
    where id = v_sub.organization_id;
  elsif p_status in ('pending', 'halted') then
    update public.organizations
    set plan = v_sub.plan, plan_interval = v_sub.interval, past_due_since = coalesce(past_due_since, now())
    where id = v_sub.organization_id;
  elsif p_status in ('cancelled', 'completed', 'expired') and v_prev in ('authenticated', 'active', 'pending', 'halted') then
    -- The plan ends: like an ended trial, selling goes on but growth stops.
    update public.organizations
    set plan = 'trial', trial_ends_at = least(coalesce(trial_ends_at, now()), now()),
        plan_interval = null, plan_renews_at = null, past_due_since = null
    where id = v_sub.organization_id;
  end if;

  if v_prev is distinct from p_status then
    perform private.log_audit(v_sub.organization_id, 'subscription.' || p_status, 'subscription', v_sub.id,
      jsonb_build_object('plan', v_sub.plan, 'interval', v_sub.interval));
  end if;
  return private.subscription_json(v_sub);
end;
$$;

-- An upgrade applied now, or a change waiting for the renewal.
create or replace function public.change_subscription_plan(
  p_provider_subscription_id text,
  p_plan public.plan_tier,
  p_interval text,
  p_base_amount numeric,
  p_amount numeric,
  p_now boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
begin
  select * into v_sub from public.subscriptions where provider_subscription_id = p_provider_subscription_id for update;
  if v_sub.id is null then
    raise exception 'Subscription not found' using errcode = 'P0002';
  end if;
  if p_now then
    update public.subscriptions
    set plan = p_plan, interval = p_interval, base_amount = p_base_amount, amount = p_amount,
        scheduled_plan = null, scheduled_interval = null, scheduled_amount = null, scheduled_base_amount = null
    where id = v_sub.id;
    update public.organizations set plan = p_plan, plan_interval = p_interval where id = v_sub.organization_id;
  else
    update public.subscriptions
    set scheduled_plan = p_plan, scheduled_interval = p_interval,
        scheduled_base_amount = p_base_amount, scheduled_amount = p_amount
    where id = v_sub.id;
  end if;
  perform private.log_audit(v_sub.organization_id, case when p_now then 'subscription.upgraded' else 'subscription.change_scheduled' end,
    'subscription', v_sub.id, jsonb_build_object('plan', p_plan, 'interval', p_interval));
end;
$$;

create or replace function public.mark_subscription_cancelling(p_provider_subscription_id text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
begin
  update public.subscriptions set cancel_at_period_end = true, scheduled_plan = null, scheduled_interval = null,
    scheduled_amount = null, scheduled_base_amount = null
  where provider_subscription_id = p_provider_subscription_id
  returning * into v_sub;
  if v_sub.id is not null then
    perform private.log_audit(v_sub.organization_id, 'subscription.cancel_requested', 'subscription', v_sub.id,
      jsonb_build_object('ends_at', v_sub.current_period_end));
  end if;
end;
$$;

/*
 * One charge: a GST tax invoice from Shopverse to the business. Prices include
 * GST at p_gst_rate; same state as the seller -> CGST + SGST, otherwise IGST.
 * Idempotent on the payment id.
 */
create or replace function public.record_platform_charge(
  p_provider_subscription_id text,
  p_payment_id text,
  p_amount numeric,
  p_seller jsonb,
  p_gst_rate numeric,
  p_sac_code text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sub     public.subscriptions;
  v_org     public.organizations;
  v_id      uuid;
  v_taxable numeric;
  v_tax     numeric;
  v_seller_code text := left(p_seller ->> 'gstin', 2);
  v_buyer_code  text;
  v_fy      text := private.financial_year(now());
  v_number  text;
begin
  select id into v_id from public.platform_invoices where provider_payment_id = p_payment_id;
  if v_id is not null then
    return v_id;
  end if;
  select * into v_sub from public.subscriptions where provider_subscription_id = p_provider_subscription_id;
  if v_sub.id is null then
    raise exception 'Subscription not found' using errcode = 'P0002';
  end if;
  select * into v_org from public.organizations where id = v_sub.organization_id;

  v_buyer_code := coalesce(left(v_org.billing_profile ->> 'gstin', 2),
    (select code from (values
      ('Jammu and Kashmir','01'),('Himachal Pradesh','02'),('Punjab','03'),('Chandigarh','04'),('Uttarakhand','05'),
      ('Haryana','06'),('Delhi','07'),('Rajasthan','08'),('Uttar Pradesh','09'),('Bihar','10'),('Sikkim','11'),
      ('Arunachal Pradesh','12'),('Nagaland','13'),('Manipur','14'),('Mizoram','15'),('Tripura','16'),('Meghalaya','17'),
      ('Assam','18'),('West Bengal','19'),('Jharkhand','20'),('Odisha','21'),('Chhattisgarh','22'),('Madhya Pradesh','23'),
      ('Gujarat','24'),('Dadra and Nagar Haveli and Daman and Diu','26'),('Maharashtra','27'),('Karnataka','29'),
      ('Goa','30'),('Lakshadweep','31'),('Kerala','32'),('Tamil Nadu','33'),('Puducherry','34'),
      ('Andaman and Nicobar Islands','35'),('Telangana','36'),('Andhra Pradesh','37'),('Ladakh','38')) s(name, code)
     where lower(name) = lower(v_org.billing_profile ->> 'state')));

  if v_seller_code is null then
    v_taxable := round(p_amount, 2);
    v_tax := 0;
  else
    v_taxable := round(p_amount * 100 / (100 + p_gst_rate), 2);
    v_tax := round(p_amount, 2) - v_taxable;
  end if;

  v_number := 'SV' || v_fy || '-' || lpad(private.next_platform_counter('invoice:' || v_fy)::text, 5, '0');
  insert into public.platform_invoices (organization_id, subscription_id, number, provider_payment_id, plan, interval,
    period_start, period_end, taxable, gst_rate, cgst, sgst, igst, total, sac_code, seller, buyer)
  values (v_org.id, v_sub.id, v_number, p_payment_id, v_sub.plan, v_sub.interval,
    v_sub.current_period_start, v_sub.current_period_end, v_taxable,
    case when v_seller_code is null then 0 else p_gst_rate end,
    case when v_seller_code is not null and v_seller_code = v_buyer_code then round(v_tax / 2, 2) else 0 end,
    case when v_seller_code is not null and v_seller_code = v_buyer_code then v_tax - round(v_tax / 2, 2) else 0 end,
    case when v_seller_code is not null and v_seller_code is distinct from v_buyer_code then v_tax else 0 end,
    round(p_amount, 2), p_sac_code, p_seller,
    v_org.billing_profile || jsonb_build_object('organization', v_org.name,
      'legal_name', coalesce(v_org.billing_profile ->> 'legal_name', v_org.name)))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.register_platform_webhook_event(p_event_id text, p_event text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into private.platform_webhook_events (event_id, event) values (p_event_id, p_event);
  return true;
exception when unique_violation then
  return false;
end;
$$;

create or replace function public.forget_platform_webhook_event(p_event_id text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from private.platform_webhook_events where event_id = p_event_id;
$$;

-- Who to email about the business's billing (billing email, else the owners).
create or replace function public.billing_contacts(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', o.name,
    'slug', o.slug,
    'emails', coalesce(
      (select jsonb_agg(distinct e) from (
         select o.billing_profile ->> 'email' as e where o.billing_profile ->> 'email' is not null
         union
         select u.email::text from public.organization_members m join auth.users u on u.id = m.user_id
         where m.organization_id = o.id and m.role = 'owner') x where e is not null), '[]'::jsonb))
  from public.organizations o where o.id = p_organization_id;
$$;

-- -----------------------------------------------------------------------------
-- Platform admin console (authenticated + private.platform_admins)
-- -----------------------------------------------------------------------------
create or replace function private.require_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin();
$$;

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  return jsonb_build_object(
    'businesses', (select count(*) from public.organizations),
    'new_30d', (select count(*) from public.organizations where created_at > now() - interval '30 days'),
    'by_plan', (select coalesce(jsonb_object_agg(plan, n), '{}'::jsonb)
                from (select plan, count(*) as n from public.organizations group by plan) x),
    'trials_active', (select count(*) from public.organizations where plan = 'trial' and trial_ends_at >= now()
                      and not exists (select 1 from public.subscriptions s where s.organization_id = organizations.id
                                      and s.status in ('cancelled', 'completed'))),
    'trials_ending_7d', (select count(*) from public.organizations where plan = 'trial'
                         and trial_ends_at between now() and now() + interval '7 days'),
    'past_due', (select count(*) from public.organizations where past_due_since is not null),
    'subscriptions', (select count(*) from public.subscriptions where status in ('authenticated', 'active', 'pending', 'halted')),
    -- Monthly recurring revenue before GST.
    'mrr', (select coalesce(sum(case interval when 'yearly' then base_amount / 12 else base_amount end), 0)
            from public.subscriptions where status in ('authenticated', 'active', 'pending')),
    'billed_30d', (select coalesce(sum(total), 0) from public.platform_invoices where issued_at > now() - interval '30 days'),
    'orders_30d', (select count(*) from public.orders where placed_at > now() - interval '30 days'),
    'gmv_30d', (select coalesce(sum(grand_total), 0) from public.orders where placed_at > now() - interval '30 days'
                and private.is_sale(orders)),
    'recent_invoices', (select coalesce(jsonb_agg(x order by x.issued_at desc), '[]'::jsonb) from (
       select i.id, i.number, i.total, i.plan, i.interval, i.issued_at, o.name as organization, o.id as organization_id
       from public.platform_invoices i join public.organizations o on o.id = i.organization_id
       order by i.issued_at desc limit 10) x)
  );
end;
$$;

create or replace function public.admin_organizations(p_search text default null, p_filter text default null,
                                                      p_limit integer default 25, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(btrim(p_search), '');
begin
  perform private.require_platform_admin();
  return (
    with base as (
      select o.*,
        (select u.email::text from public.organization_members m join auth.users u on u.id = m.user_id
         where m.organization_id = o.id and m.role = 'owner' order by m.created_at limit 1) as owner_email
      from public.organizations o
    ),
    filtered as (
      select * from base b
      where (v_q is null or b.name ilike '%' || v_q || '%' or b.slug ilike '%' || v_q || '%'
             or b.owner_email ilike '%' || v_q || '%')
        and (p_filter is null
             or (p_filter = 'trial' and b.plan = 'trial' and b.trial_ends_at >= now())
             or (p_filter = 'trial_ended' and b.plan = 'trial' and b.trial_ends_at < now())
             or (p_filter = 'paying' and b.plan <> 'trial')
             or (p_filter = 'past_due' and b.past_due_since is not null))
    )
    select jsonb_build_object(
      'total', (select count(*) from filtered),
      'items', coalesce((select jsonb_agg(jsonb_build_object(
          'id', f.id, 'name', f.name, 'slug', f.slug, 'plan', f.plan, 'interval', f.plan_interval,
          'trial_ends_at', f.trial_ends_at, 'renews_at', f.plan_renews_at, 'past_due_since', f.past_due_since,
          'owner_email', f.owner_email, 'created_at', f.created_at,
          'shops', (select count(*) from public.shops s where s.organization_id = f.id and s.status <> 'archived'),
          'orders_30d', (select count(*) from public.orders x where x.organization_id = f.id and x.placed_at > now() - interval '30 days'),
          'gmv_30d', (select coalesce(sum(x.grand_total), 0) from public.orders x where x.organization_id = f.id
                      and x.placed_at > now() - interval '30 days' and private.is_sale(x)))
        order by f.created_at desc)
        from (select * from filtered order by created_at desc limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)) f), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.admin_organization(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
begin
  perform private.require_platform_admin();
  select * into v_org from public.organizations where id = p_organization_id;
  if v_org.id is null then
    raise exception 'Business not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'id', v_org.id, 'name', v_org.name, 'slug', v_org.slug, 'plan', v_org.plan, 'interval', v_org.plan_interval,
    'trial_ends_at', v_org.trial_ends_at, 'renews_at', v_org.plan_renews_at, 'past_due_since', v_org.past_due_since,
    'created_at', v_org.created_at, 'industries', v_org.industries, 'profile', v_org.billing_profile,
    'usage', private.org_usage(v_org.id), 'limits', private.plan_limits(v_org.plan),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('email', u.email, 'name', p.full_name, 'role', m.role,
                                                             'joined_at', m.created_at) order by m.created_at), '[]'::jsonb)
                from public.organization_members m join auth.users u on u.id = m.user_id
                left join public.profiles p on p.id = m.user_id where m.organization_id = v_org.id),
    'shops', (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'slug', s.slug, 'status', s.status)
                                        order by s.created_at), '[]'::jsonb)
              from public.shops s where s.organization_id = v_org.id),
    'subscriptions', (select coalesce(jsonb_agg(private.subscription_json(s) || jsonb_build_object('created_at', s.created_at,
                                                'ended_at', s.ended_at) order by s.created_at desc), '[]'::jsonb)
                      from public.subscriptions s where s.organization_id = v_org.id),
    'invoices', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'number', i.number, 'total', i.total,
                                           'plan', i.plan, 'interval', i.interval, 'issued_at', i.issued_at)
                                           order by i.issued_at desc), '[]'::jsonb)
                 from public.platform_invoices i where i.organization_id = v_org.id),
    'orders_30d', (select count(*) from public.orders x where x.organization_id = v_org.id and x.placed_at > now() - interval '30 days'),
    'gmv_30d', (select coalesce(sum(x.grand_total), 0) from public.orders x where x.organization_id = v_org.id
                and x.placed_at > now() - interval '30 days' and private.is_sale(x)),
    'audit', (select coalesce(jsonb_agg(jsonb_build_object('action', a.action, 'at', a.created_at, 'metadata', a.metadata,
                                                           'actor', u.email) order by a.created_at desc), '[]'::jsonb)
              from (select * from public.audit_logs where organization_id = v_org.id
                    and (action like 'subscription.%' or action like 'admin.%' or action like 'billing.%')
                    order by created_at desc limit 20) a
              left join auth.users u on u.id = a.actor_id)
  );
end;
$$;

create or replace function public.admin_extend_trial(p_organization_id uuid, p_days integer)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
begin
  perform private.require_platform_admin();
  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'Extend by 1 to 90 days' using errcode = 'check_violation';
  end if;
  select * into v_org from public.organizations where id = p_organization_id for update;
  if v_org.id is null then
    raise exception 'Business not found' using errcode = 'P0002';
  end if;
  if v_org.plan <> 'trial' then
    raise exception 'This business has a plan; trials apply only without one' using errcode = 'check_violation';
  end if;
  update public.organizations
  set trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + make_interval(days => p_days)
  where id = p_organization_id
  returning trial_ends_at into v_org.trial_ends_at;
  perform private.log_audit(p_organization_id, 'admin.trial_extended', 'organization', p_organization_id,
    jsonb_build_object('days', p_days, 'until', v_org.trial_ends_at));
  return v_org.trial_ends_at;
end;
$$;

-- A plan set by hand (a deal, a partner, a correction). Not billed through Razorpay.
create or replace function public.admin_set_plan(p_organization_id uuid, p_plan public.plan_tier, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
begin
  perform private.require_platform_admin();
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'Say why (it is kept in the business''s audit log)' using errcode = 'check_violation';
  end if;
  select * into v_org from public.organizations where id = p_organization_id for update;
  if v_org.id is null then
    raise exception 'Business not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.subscriptions where organization_id = p_organization_id
             and status in ('authenticated', 'active', 'pending', 'halted')) then
    raise exception 'This business pays by subscription. They change their plan in Billing.' using errcode = 'check_violation';
  end if;
  update public.organizations
  set plan = p_plan, plan_interval = null, plan_renews_at = null, past_due_since = null,
      trial_ends_at = case when p_plan = 'trial' then greatest(coalesce(trial_ends_at, now()), now() + interval '14 days') else trial_ends_at end
  where id = p_organization_id;
  perform private.log_audit(p_organization_id, 'admin.plan_set', 'organization', p_organization_id,
    jsonb_build_object('from', v_org.plan, 'to', p_plan, 'note', left(btrim(p_note), 300)));
end;
$$;

-- Owner/admin: one Shopverse invoice.
create or replace function public.platform_invoice(p_invoice_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(i) from public.platform_invoices i
  where i.id = p_invoice_id
    and (private.has_org_role(i.organization_id, array['owner', 'admin']::public.org_role[]) or private.is_platform_admin());
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function private.is_platform_admin() from public;
revoke all on function private.next_platform_counter(text) from public;
revoke all on function private.plan_overages(uuid, public.plan_tier) from public;
revoke all on function private.subscription_json(public.subscriptions) from public;
revoke all on function private.current_subscription(uuid) from public;
revoke all on function private.require_platform_admin() from public;

revoke all on function public.save_billing_profile(uuid, jsonb) from public, anon;
grant execute on function public.save_billing_profile(uuid, jsonb) to authenticated;
revoke all on function public.platform_invoice(uuid) from public, anon;
grant execute on function public.platform_invoice(uuid) to authenticated;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
revoke all on function public.admin_organizations(text, text, integer, integer) from public, anon;
grant execute on function public.admin_organizations(text, text, integer, integer) to authenticated;
revoke all on function public.admin_organization(uuid) from public, anon;
grant execute on function public.admin_organization(uuid) to authenticated;
revoke all on function public.admin_extend_trial(uuid, integer) from public, anon;
grant execute on function public.admin_extend_trial(uuid, integer) to authenticated;
revoke all on function public.admin_set_plan(uuid, public.plan_tier, text) from public, anon;
grant execute on function public.admin_set_plan(uuid, public.plan_tier, text) to authenticated;

revoke all on function public.platform_provider_plan(public.plan_tier, text, numeric) from public, anon, authenticated;
grant execute on function public.platform_provider_plan(public.plan_tier, text, numeric) to service_role;
revoke all on function public.save_provider_plan(public.plan_tier, text, numeric, numeric, text) from public, anon, authenticated;
grant execute on function public.save_provider_plan(public.plan_tier, text, numeric, numeric, text) to service_role;
revoke all on function public.begin_subscription(uuid, uuid, public.plan_tier, text, numeric, numeric, text, text) from public, anon, authenticated;
grant execute on function public.begin_subscription(uuid, uuid, public.plan_tier, text, numeric, numeric, text, text) to service_role;
revoke all on function public.sync_subscription(text, text, text, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.sync_subscription(text, text, text, timestamptz, timestamptz, text) to service_role;
revoke all on function public.change_subscription_plan(text, public.plan_tier, text, numeric, numeric, boolean) from public, anon, authenticated;
grant execute on function public.change_subscription_plan(text, public.plan_tier, text, numeric, numeric, boolean) to service_role;
revoke all on function public.mark_subscription_cancelling(text) from public, anon, authenticated;
grant execute on function public.mark_subscription_cancelling(text) to service_role;
revoke all on function public.record_platform_charge(text, text, numeric, jsonb, numeric, text) from public, anon, authenticated;
grant execute on function public.record_platform_charge(text, text, numeric, jsonb, numeric, text) to service_role;
revoke all on function public.register_platform_webhook_event(text, text) from public, anon, authenticated;
grant execute on function public.register_platform_webhook_event(text, text) to service_role;
revoke all on function public.forget_platform_webhook_event(text) from public, anon, authenticated;
grant execute on function public.forget_platform_webhook_event(text) to service_role;
revoke all on function public.billing_contacts(uuid) from public, anon, authenticated;
grant execute on function public.billing_contacts(uuid) to service_role;
