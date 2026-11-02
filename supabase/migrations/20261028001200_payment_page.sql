-- =============================================================================
-- Payments on Shopverse's own pages.
--
-- Shoppers now pay on the shop's own payment page, with Stripe's secure
-- payment fields placed in it, instead of being sent to Stripe's page. That
-- needs each business's publishable key (pk_test_… / pk_live_…). It isn't a
-- secret (it's in the page), so it's stored as is. Without one, checkout keeps
-- using Stripe's hosted page.
-- =============================================================================

alter table private.payment_accounts
  add column publishable_key text
    check (publishable_key ~ '^pk_(test|live)_[A-Za-z0-9]{10,247}$');

-- What owners and admins may see (never the secrets).
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
    'publishable_key', v_account.publishable_key,
    'updated_at', v_account.updated_at);
end;
$$;

-- Server only.
create or replace function public.payment_account_credentials(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('key_id', key_id, 'key_secret_enc', key_secret_enc,
                            'webhook_secret_enc', webhook_secret_enc, 'enabled', enabled,
                            'publishable_key', publishable_key)
  from private.payment_accounts where organization_id = p_organization_id;
$$;

drop function public.save_payment_account(uuid, text, text, text, text, boolean);

-- Connect or update. Null secrets keep the stored ones; a null publishable key
-- keeps it and '' removes it. The server checks the secret key with Stripe
-- first and passes the account id and mode it reported.
create or replace function public.save_payment_account(
  p_organization_id    uuid,
  p_key_id             text,
  p_mode               text,
  p_key_secret_enc     text default null,
  p_webhook_secret_enc text default null,
  p_enabled            boolean default null,
  p_publishable_key    text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_publishable text := nullif(btrim(p_publishable_key), '');
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
  if v_publishable is not null and v_publishable !~ ('^pk_' || p_mode || '_') then
    raise exception 'The publishable key must be a % key, like the secret key', p_mode
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from private.payment_accounts where organization_id = p_organization_id) then
    update private.payment_accounts
    set key_id = p_key_id,
        mode = p_mode,
        key_secret_enc = coalesce(p_key_secret_enc, key_secret_enc),
        webhook_secret_enc = coalesce(p_webhook_secret_enc, webhook_secret_enc),
        enabled = coalesce(p_enabled, enabled),
        publishable_key = case when p_publishable_key is null then publishable_key else v_publishable end,
        updated_by = auth.uid()
    where organization_id = p_organization_id;
    -- A key from the other mode can't stay after switching between test and live.
    update private.payment_accounts set publishable_key = null
    where organization_id = p_organization_id and publishable_key !~ ('^pk_' || p_mode || '_');
  else
    if p_key_secret_enc is null then
      raise exception 'Enter the secret key' using errcode = 'check_violation';
    end if;
    insert into private.payment_accounts (organization_id, key_id, mode, key_secret_enc, webhook_secret_enc,
                                          enabled, publishable_key, updated_by)
    values (p_organization_id, p_key_id, p_mode, p_key_secret_enc, p_webhook_secret_enc,
            coalesce(p_enabled, true), v_publishable, auth.uid());
  end if;

  perform private.log_audit(p_organization_id, 'payments.updated', 'payment_account', p_organization_id,
    jsonb_build_object('account', p_key_id, 'mode', p_mode, 'enabled', p_enabled,
                       'secret_changed', p_key_secret_enc is not null,
                       'webhook_secret_changed', p_webhook_secret_enc is not null,
                       'publishable_key_changed', p_publishable_key is not null));
end;
$$;

revoke all on function public.save_payment_account(uuid, text, text, text, text, boolean, text) from public, anon;
grant execute on function public.save_payment_account(uuid, text, text, text, text, boolean, text) to authenticated;
