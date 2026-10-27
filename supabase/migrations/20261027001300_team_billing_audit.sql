-- =============================================================================
-- Shopverse · Migration 013 · Team management, plan limits, audit log viewer
--
--  * Invitations carry a random token (only its SHA-256 is stored), a role and
--    optional per-shop access. Accepting requires signing in with the invited
--    email address.
--  * Member changes go through functions with explicit rules (admins manage
--    non-owners; only owners touch owners; nobody edits their own role).
--  * Plans have limits (shops, seats, products) enforced by triggers; an
--    expired trial blocks growth, never existing orders or stock.
-- =============================================================================

-- Invitation columns (used by the seat count below).
alter table public.organization_invitations
  add column token_hash text,
  add column all_shops boolean not null default true,
  add column shop_ids uuid[] not null default '{}',
  add column revoked_at timestamptz,
  add column accepted_by uuid references auth.users (id) on delete set null;

-- -----------------------------------------------------------------------------
-- Plans
-- -----------------------------------------------------------------------------
create or replace function private.plan_limits(p_plan public.plan_tier)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  -- null = unlimited
  select case p_plan
    when 'trial'   then '{"shops": 2, "seats": 5,  "products": 200,   "warehouses": 2}'::jsonb
    when 'starter' then '{"shops": 1, "seats": 3,  "products": 500,   "warehouses": 1}'::jsonb
    when 'growth'  then '{"shops": 3, "seats": 10, "products": 5000,  "warehouses": 5}'::jsonb
    when 'scale'   then '{"shops": null, "seats": null, "products": null, "warehouses": null}'::jsonb
  end;
$$;

create or replace function private.org_usage(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'shops', (select count(*) from public.shops where organization_id = p_organization_id and status <> 'archived'),
    'seats', (select count(*) from public.organization_members where organization_id = p_organization_id)
           + (select count(*) from public.organization_invitations
              where organization_id = p_organization_id and accepted_at is null and revoked_at is null
                and expires_at > now()),
    'products', (select count(*) from public.products where organization_id = p_organization_id and status <> 'archived'),
    'warehouses', (select count(*) from public.warehouses where organization_id = p_organization_id and is_active),
    'orders_this_month', (select count(*) from public.orders
                          where organization_id = p_organization_id
                            and placed_at >= date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')
  );
$$;

-- Raise if adding one more `p_resource` would exceed the plan (or the trial ended).
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

create or replace function private.enforce_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Trusted server code (no user) is not limited, and for non-members we let
  -- RLS reject the write with its usual permission error.
  if auth.uid() is null or not private.is_org_member(new.organization_id) then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    -- Only re-check when a row comes back into use. (Separate branches: each
    -- table has different columns, and PL/pgSQL plans a branch when it runs.)
    if tg_table_name = 'warehouses' then
      if old.is_active or not new.is_active then
        return new;
      end if;
    elsif old.status <> 'archived' or new.status = 'archived' then
      return new;
    end if;
  end if;
  perform private.check_plan_limit(new.organization_id, tg_argv[0]);
  return new;
end;
$$;

create trigger shops_plan_limit before insert or update of status on public.shops
  for each row execute function private.enforce_plan_limit('shops');
create trigger products_plan_limit before insert or update of status on public.products
  for each row execute function private.enforce_plan_limit('products');
create trigger warehouses_plan_limit before insert or update of is_active on public.warehouses
  for each row execute function private.enforce_plan_limit('warehouses');

create or replace function public.get_billing_overview(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'Organization not found' using errcode = 'no_data_found';
  end if;
  select * into v_org from public.organizations where id = p_organization_id;
  return jsonb_build_object(
    'plan', v_org.plan,
    'trial_ends_at', v_org.trial_ends_at,
    'trial_expired', v_org.plan = 'trial' and v_org.trial_ends_at < now(),
    'limits', private.plan_limits(v_org.plan),
    'usage', private.org_usage(p_organization_id),
    'plans', jsonb_build_object(
      'starter', private.plan_limits('starter'),
      'growth', private.plan_limits('growth'),
      'scale', private.plan_limits('scale'))
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Invitations
-- -----------------------------------------------------------------------------

create unique index organization_invitations_token_uidx on public.organization_invitations (token_hash);

-- Re-create the "one pending invite per email" rule to ignore revoked ones.
drop index public.organization_invitations_pending_uidx;
create unique index organization_invitations_pending_uidx
  on public.organization_invitations (organization_id, email)
  where accepted_at is null and revoked_at is null;

create or replace function private.token_hash(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- Admins may manage anyone except owners; only owners manage owners.
create or replace function private.can_manage_role(p_organization_id uuid, p_role public.org_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_role = 'owner' then private.has_org_role(p_organization_id, array['owner']::public.org_role[])
    else private.has_org_role(p_organization_id, array['owner', 'admin']::public.org_role[])
  end;
$$;

create or replace function private.valid_shop_ids(p_organization_id uuid, p_shop_ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(cardinality(p_shop_ids), 0) = (
    select count(*) from public.shops where organization_id = p_organization_id and id = any (p_shop_ids)
  );
$$;

-- Returns the plain token once (for the invitation email / copy link).
create or replace function public.invite_member(
  p_organization_id uuid,
  p_email           text,
  p_role            public.org_role,
  p_all_shops       boolean default true,
  p_shop_ids        uuid[] default '{}'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email  text := lower(btrim(p_email));
  v_token  text := encode(extensions.gen_random_bytes(32), 'hex');
  v_id     uuid;
  v_shops  uuid[] := case when p_all_shops then '{}' else coalesce(p_shop_ids, '{}') end;
begin
  if p_role = 'owner' then
    raise exception 'Invite as admin, then make them an owner once they have joined' using errcode = 'check_violation';
  end if;
  if not private.can_manage_role(p_organization_id, p_role) then
    raise exception 'Only owners and admins can invite people' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address' using errcode = 'check_violation';
  end if;
  if not p_all_shops and cardinality(v_shops) = 0 then
    raise exception 'Choose at least one shop, or give access to all shops' using errcode = 'check_violation';
  end if;
  if not private.valid_shop_ids(p_organization_id, v_shops) then
    raise exception 'Unknown shop' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.organization_members m join public.profiles p on p.id = m.user_id
    where m.organization_id = p_organization_id and p.email = v_email::extensions.citext
  ) then
    raise exception '% is already on the team', v_email using errcode = 'unique_violation';
  end if;

  -- Re-inviting refreshes the pending invitation (new link, new expiry).
  select id into v_id from public.organization_invitations
  where organization_id = p_organization_id and email = v_email::extensions.citext
    and accepted_at is null and revoked_at is null;

  if v_id is null then
    perform private.check_plan_limit(p_organization_id, 'seats');
    insert into public.organization_invitations (organization_id, email, role, invited_by, token_hash, all_shops, shop_ids)
    values (p_organization_id, v_email, p_role, auth.uid(), private.token_hash(v_token), p_all_shops, v_shops)
    returning id into v_id;
  else
    update public.organization_invitations
    set role = p_role, invited_by = auth.uid(), token_hash = private.token_hash(v_token),
        all_shops = p_all_shops, shop_ids = v_shops, expires_at = now() + interval '7 days'
    where id = v_id;
  end if;

  perform private.log_audit(p_organization_id, 'invitation.sent', 'invitation', v_id,
    jsonb_build_object('email', v_email, 'role', p_role));
  return jsonb_build_object('invitation_id', v_id, 'token', v_token);
end;
$$;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.organization_invitations;
begin
  select * into v_inv from public.organization_invitations where id = p_invitation_id;
  if v_inv.id is null or not private.has_org_role(v_inv.organization_id, array['owner', 'admin']::public.org_role[]) then
    raise exception 'Invitation not found' using errcode = 'no_data_found';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'This invitation was already accepted' using errcode = 'check_violation';
  end if;
  update public.organization_invitations set revoked_at = now(), token_hash = null where id = p_invitation_id;
  perform private.log_audit(v_inv.organization_id, 'invitation.revoked', 'invitation', v_inv.id,
    jsonb_build_object('email', v_inv.email::text));
end;
$$;

-- What the invite page shows. Anyone holding the link may see it.
create or replace function public.get_invitation(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'organization', jsonb_build_object('name', o.name, 'slug', o.slug),
    'email', i.email::text,
    'role', i.role,
    'invited_by', coalesce(p.full_name, p.email::text),
    'expires_at', i.expires_at,
    'status', case
      when i.revoked_at is not null then 'revoked'
      when i.accepted_at is not null then 'accepted'
      when i.expires_at < now() then 'expired'
      else 'pending' end
  )
  from public.organization_invitations i
  join public.organizations o on o.id = i.organization_id
  left join public.profiles p on p.id = i.invited_by
  where p_token ~ '^[0-9a-f]{64}$' and i.token_hash = private.token_hash(p_token);
$$;

create or replace function public.accept_invitation(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inv       public.organization_invitations;
  v_email     text;
  v_member_id uuid;
  v_slug      text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to accept the invitation' using errcode = '42501';
  end if;
  select * into v_inv from public.organization_invitations
  where p_token ~ '^[0-9a-f]{64}$' and token_hash = private.token_hash(p_token)
  for update;
  if v_inv.id is null or v_inv.revoked_at is not null then
    raise exception 'This invitation is no longer valid' using errcode = 'no_data_found';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'This invitation was already used' using errcode = 'check_violation';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'This invitation has expired. Ask for a new one.' using errcode = 'check_violation';
  end if;

  select email::text into v_email from public.profiles where id = auth.uid();
  if v_email is null or lower(v_email) <> lower(v_inv.email::text) then
    raise exception 'This invitation is for %. Sign in with that email to accept it.', v_inv.email::text
      using errcode = '42501';
  end if;

  insert into public.organization_members (organization_id, user_id, role, all_shops)
  values (v_inv.organization_id, auth.uid(), v_inv.role, v_inv.all_shops)
  on conflict (organization_id, user_id) do nothing
  returning id into v_member_id;

  if v_member_id is not null and not v_inv.all_shops then
    insert into public.member_shop_access (member_id, shop_id)
    select v_member_id, s from unnest(v_inv.shop_ids) s
    join public.shops sh on sh.id = s and sh.organization_id = v_inv.organization_id;
  end if;

  update public.organization_invitations
  set accepted_at = now(), accepted_by = auth.uid(), token_hash = null
  where id = v_inv.id;

  perform private.log_audit(v_inv.organization_id, 'invitation.accepted', 'invitation', v_inv.id,
    jsonb_build_object('email', v_inv.email::text, 'role', v_inv.role));

  select slug into v_slug from public.organizations where id = v_inv.organization_id;
  return jsonb_build_object('organization_slug', v_slug);
end;
$$;

-- -----------------------------------------------------------------------------
-- Members
-- -----------------------------------------------------------------------------
create or replace function public.update_member(
  p_member_id uuid,
  p_role      public.org_role,
  p_all_shops boolean,
  p_shop_ids  uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.organization_members;
  v_shops  uuid[] := case when p_all_shops then '{}' else coalesce(p_shop_ids, '{}') end;
begin
  select * into v_member from public.organization_members where id = p_member_id for update;
  if v_member.id is null or not private.is_org_member(v_member.organization_id) then
    raise exception 'Team member not found' using errcode = 'no_data_found';
  end if;
  if v_member.user_id = auth.uid() then
    raise exception 'You can''t change your own role or access' using errcode = '42501';
  end if;
  -- Need authority over both the current and the new role.
  if not private.can_manage_role(v_member.organization_id, v_member.role)
     or not private.can_manage_role(v_member.organization_id, p_role) then
    raise exception 'Only owners can change owners or make someone an owner' using errcode = '42501';
  end if;
  if not p_all_shops and cardinality(v_shops) = 0 then
    raise exception 'Choose at least one shop, or give access to all shops' using errcode = 'check_violation';
  end if;
  if not private.valid_shop_ids(v_member.organization_id, v_shops) then
    raise exception 'Unknown shop' using errcode = 'check_violation';
  end if;
  if p_role in ('owner', 'admin') and not p_all_shops then
    raise exception 'Owners and admins always see every shop' using errcode = 'check_violation';
  end if;

  update public.organization_members set role = p_role, all_shops = p_all_shops where id = p_member_id;
  delete from public.member_shop_access where member_id = p_member_id and not (shop_id = any (v_shops));
  insert into public.member_shop_access (member_id, shop_id)
  select p_member_id, s from unnest(v_shops) s
  on conflict do nothing;
end;
$$;

create or replace function public.remove_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.organization_members;
begin
  select * into v_member from public.organization_members where id = p_member_id;
  if v_member.id is null or not private.is_org_member(v_member.organization_id) then
    raise exception 'Team member not found' using errcode = 'no_data_found';
  end if;
  -- Leaving is always allowed (the last owner is protected by a trigger).
  if v_member.user_id <> auth.uid() and not private.can_manage_role(v_member.organization_id, v_member.role) then
    raise exception 'Only owners can remove an owner' using errcode = '42501';
  end if;
  delete from public.organization_members where id = p_member_id;
end;
$$;

-- Admin-only writes now go through the functions above.
revoke insert, update, delete on public.organization_members, public.organization_invitations,
  public.member_shop_access from authenticated, anon;
revoke all on public.organization_invitations from anon;
-- Token hashes are not for reading, even by admins.
revoke select on public.organization_invitations from authenticated;
grant select (id, organization_id, email, role, invited_by, expires_at, accepted_at, created_at,
  all_shops, shop_ids, revoked_at, accepted_by) on public.organization_invitations to authenticated;

create view public.team_overview
with (security_invoker = true) as
select
  m.id,
  m.organization_id,
  m.user_id,
  m.role,
  m.all_shops,
  m.created_at,
  p.email::text as email,
  p.full_name,
  coalesce((select array_agg(a.shop_id) from public.member_shop_access a where a.member_id = m.id), '{}') as shop_ids
from public.organization_members m
left join public.profiles p on p.id = m.user_id;

-- Names of people who acted in an organization stay readable in its audit
-- trail even after they leave (profiles RLS would otherwise hide them).
create or replace function private.actor_label(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(full_name, email::text) from public.profiles where id = p_user_id;
$$;

create view public.audit_log_view
with (security_invoker = true) as
select
  l.id,
  l.organization_id,
  l.action,
  l.entity_type,
  l.entity_id,
  l.metadata,
  l.created_at,
  l.actor_id,
  private.actor_label(l.actor_id) as actor_name
from public.audit_logs l;

revoke all on public.team_overview, public.audit_log_view from anon;
grant select on public.team_overview, public.audit_log_view to authenticated;

revoke all on function public.invite_member(uuid, text, public.org_role, boolean, uuid[]) from public, anon;
revoke all on function public.revoke_invitation(uuid) from public, anon;
revoke all on function public.accept_invitation(text) from public, anon;
revoke all on function public.update_member(uuid, public.org_role, boolean, uuid[]) from public, anon;
revoke all on function public.remove_member(uuid) from public, anon;
revoke all on function public.get_billing_overview(uuid) from public, anon;
revoke all on function public.get_invitation(text) from public;
grant execute on function public.invite_member(uuid, text, public.org_role, boolean, uuid[]) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.update_member(uuid, public.org_role, boolean, uuid[]) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;
grant execute on function public.get_billing_overview(uuid) to authenticated;
grant execute on function public.get_invitation(text) to anon, authenticated;
