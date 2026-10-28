-- =============================================================================
-- Shopverse · Migration 024 · Stripe replaces Razorpay
--
--  * Businesses connect their own Stripe account with a secret key (test keys
--    work without any verification). The account id (acct_…) is shown to
--    staff; the key and webhook signing secret stay encrypted and are only
--    readable by the service role, as before.
--  * Shop payments use Stripe Checkout: payments.provider_order_id holds the
--    Checkout Session (cs_…) and provider_payment_id the PaymentIntent (pi_…).
--  * Shopverse plans use Stripe Billing. A subscription starts as a Checkout
--    Session; link_checkout_subscription swaps in the real subscription id
--    once Stripe has created it. Prices (price_…) are cached as before.
--  * Razorpay keys and cached Razorpay plans can't be used with Stripe, so
--    they are removed. Payment history keeps its 'razorpay' provider.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Payment accounts
-- -----------------------------------------------------------------------------
delete from private.payment_accounts;

alter table private.payment_accounts
  drop constraint if exists payment_accounts_provider_check,
  drop constraint if exists payment_accounts_key_id_check;

alter table private.payment_accounts
  alter column provider set default 'stripe',
  add constraint payment_accounts_provider_check check (provider = 'stripe'),
  -- The Stripe account the key belongs to.
  add constraint payment_accounts_key_id_check check (key_id ~ '^acct_[A-Za-z0-9]{6,64}$'),
  add column mode text not null default 'test' check (mode in ('test', 'live'));

alter table public.payments alter column provider set default 'stripe';
alter table public.subscriptions alter column provider set default 'stripe';

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
    'mode', v_account.mode,
    'enabled', v_account.enabled,
    'webhook_configured', v_account.webhook_secret_enc is not null,
    'updated_at', v_account.updated_at);
end;
$$;

drop function public.save_payment_account(uuid, text, text, text, boolean);

-- Connect or update. Null secrets keep the stored ones. The server checks the
-- key with Stripe first and passes the account id and mode it reported.
create or replace function public.save_payment_account(
  p_organization_id    uuid,
  p_key_id             text,
  p_mode               text,
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
  if p_key_id is null or p_key_id !~ '^acct_[A-Za-z0-9]{6,64}$' then
    raise exception 'That isn''t a Stripe account' using errcode = 'check_violation';
  end if;
  if p_mode is null or p_mode not in ('test', 'live') then
    raise exception 'Unknown key mode' using errcode = 'check_violation';
  end if;

  if exists (select 1 from private.payment_accounts where organization_id = p_organization_id) then
    update private.payment_accounts
    set key_id = p_key_id,
        mode = p_mode,
        key_secret_enc = coalesce(p_key_secret_enc, key_secret_enc),
        webhook_secret_enc = coalesce(p_webhook_secret_enc, webhook_secret_enc),
        enabled = coalesce(p_enabled, enabled),
        updated_by = auth.uid()
    where organization_id = p_organization_id;
  else
    if p_key_secret_enc is null then
      raise exception 'Enter the secret key' using errcode = 'check_violation';
    end if;
    insert into private.payment_accounts (organization_id, key_id, mode, key_secret_enc, webhook_secret_enc, enabled, updated_by)
    values (p_organization_id, p_key_id, p_mode, p_key_secret_enc, p_webhook_secret_enc, coalesce(p_enabled, true), auth.uid());
  end if;

  perform private.log_audit(p_organization_id, 'payments.updated', 'payment_account', p_organization_id,
    jsonb_build_object('account', p_key_id, 'mode', p_mode, 'enabled', p_enabled,
                       'secret_changed', p_key_secret_enc is not null,
                       'webhook_secret_changed', p_webhook_secret_enc is not null));
end;
$$;

revoke all on function public.save_payment_account(uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.save_payment_account(uuid, text, text, text, text, boolean) to authenticated;

-- Stripe's payment method types -> ours.
create or replace function private.payment_method_from(p_method text)
returns public.payment_method
language sql
immutable
set search_path = ''
as $$
  select case p_method
    when 'upi' then 'upi'
    when 'card' then 'card'
    when 'link' then 'card'
    when 'emi' then 'card'
    when 'netbanking' then 'netbanking'
    when 'wallet' then 'wallet'
    when 'paylater' then 'wallet'
    when 'paypal' then 'wallet'
    when 'amazon_pay' then 'wallet'
    else 'online'
  end::public.payment_method;
$$;

-- -----------------------------------------------------------------------------
-- Shopverse billing
-- -----------------------------------------------------------------------------
delete from private.platform_provider_plans;

-- Checkouts that were started with Razorpay can't complete any more.
update public.subscriptions set status = 'expired', ended_at = now()
where provider = 'razorpay' and status = 'created';

/*
 * A plan checkout is recorded under its Checkout Session id (cs_…). Once Stripe
 * has created the subscription, use its id instead. Idempotent: returns the
 * business either way, or null if the checkout is unknown.
 */
create or replace function public.link_checkout_subscription(
  p_checkout_id text,
  p_provider_subscription_id text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.subscriptions
  where provider_subscription_id = p_provider_subscription_id;
  if v_org is not null then
    return v_org;
  end if;
  update public.subscriptions s
  set provider_subscription_id = p_provider_subscription_id,
      -- An abandoned attempt that was paid after all comes back to life,
      -- unless the business has started another plan since.
      status = case when s.status = 'expired' and not exists (
                 select 1 from public.subscriptions o where o.organization_id = s.organization_id
                 and o.status in ('authenticated', 'active', 'pending', 'halted')) then 'created' else s.status end,
      ended_at = case when s.status = 'expired' and not exists (
                 select 1 from public.subscriptions o where o.organization_id = s.organization_id
                 and o.status in ('authenticated', 'active', 'pending', 'halted')) then null else s.ended_at end
  where s.provider_subscription_id = p_checkout_id
  returning s.organization_id into v_org;
  return v_org;
end;
$$;

revoke all on function public.link_checkout_subscription(text, text) from public, anon, authenticated;
grant execute on function public.link_checkout_subscription(text, text) to service_role;

-- An expired Checkout Session has no payment; '' means "none".
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
    provider_payment_id = coalesce(provider_payment_id, nullif(p_provider_payment_id, ''))
  where id = v_payment.id;
  perform private.add_order_event(v_payment.organization_id, v_payment.order_id, 'payment.failed',
    'Online payment failed' || coalesce(': ' || left(p_reason, 200), ''));
end;
$$;
