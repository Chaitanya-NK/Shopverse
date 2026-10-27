-- =============================================================================
-- Shopverse · Migration 001 · Foundation
-- Tenancy model: organization -> shops / warehouses, with role-based membership.
-- Every tenant-owned row carries organization_id and is protected by RLS.
-- =============================================================================

create extension if not exists citext with schema extensions;

-- Helper functions used by RLS policies live in a schema that is NOT exposed
-- through the Data API, so clients cannot call them directly.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.org_role as enum ('owner', 'admin', 'manager', 'staff', 'support');
create type public.shop_status as enum ('draft', 'live', 'paused', 'archived');
create type public.plan_tier as enum ('trial', 'starter', 'growth', 'scale');

-- -----------------------------------------------------------------------------
-- Generic triggers
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       extensions.citext not null,
  full_name   text check (char_length(full_name) between 1 and 120),
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Organizations & membership
-- -----------------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 80),
  slug        text not null unique
              check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$'),
  plan        public.plan_tier not null default 'trial',
  trial_ends_at timestamptz default (now() + interval '14 days'),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function private.set_updated_at();

create table public.organization_members (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  role             public.org_role not null default 'staff',
  -- When false, access is limited to the shops listed in member_shop_access.
  all_shops        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members (user_id);

create trigger organization_members_set_updated_at
  before update on public.organization_members
  for each row execute function private.set_updated_at();

create table public.organization_invitations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  email            extensions.citext not null,
  role             public.org_role not null default 'staff',
  invited_by       uuid references auth.users (id) on delete set null,
  expires_at       timestamptz not null default (now() + interval '7 days'),
  accepted_at      timestamptz,
  created_at       timestamptz not null default now(),
  constraint invitations_role_not_owner check (role <> 'owner')
);

create unique index organization_invitations_pending_uidx
  on public.organization_invitations (organization_id, email)
  where accepted_at is null;

-- -----------------------------------------------------------------------------
-- Shops & warehouses
-- -----------------------------------------------------------------------------
create table public.shops (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  name             text not null check (char_length(name) between 2 and 80),
  slug             text not null check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$'),
  status           public.shop_status not null default 'draft',
  currency         char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  timezone         text not null default 'Asia/Kolkata',
  order_prefix     text not null default 'ORD' check (order_prefix ~ '^[A-Z0-9]{2,6}$'),
  custom_domain    extensions.citext unique,
  settings         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, slug),
  -- Composite key lets child tables prove a shop belongs to the same organization.
  unique (organization_id, id)
);

create index shops_organization_id_idx on public.shops (organization_id);

create trigger shops_set_updated_at
  before update on public.shops
  for each row execute function private.set_updated_at();

create table public.member_shop_access (
  member_id        uuid not null references public.organization_members (id) on delete cascade,
  shop_id          uuid not null references public.shops (id) on delete cascade,
  created_at       timestamptz not null default now(),
  primary key (member_id, shop_id)
);

create index member_shop_access_shop_id_idx on public.member_shop_access (shop_id);

create table public.warehouses (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  name             text not null check (char_length(name) between 2 and 80),
  code             text not null check (code ~ '^[A-Z0-9-]{2,12}$'),
  address          jsonb not null default '{}'::jsonb,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, id)
);

create index warehouses_organization_id_idx on public.warehouses (organization_id);

create trigger warehouses_set_updated_at
  before update on public.warehouses
  for each row execute function private.set_updated_at();

-- Which warehouses fulfil which shop, in priority order (1 = first choice).
create table public.shop_warehouses (
  organization_id  uuid not null,
  shop_id          uuid not null,
  warehouse_id     uuid not null,
  priority         smallint not null default 1 check (priority between 1 and 100),
  created_at       timestamptz not null default now(),
  primary key (shop_id, warehouse_id),
  foreign key (organization_id, shop_id) references public.shops (organization_id, id) on delete cascade,
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id) on delete cascade
);

create index shop_warehouses_warehouse_id_idx on public.shop_warehouses (warehouse_id);

-- -----------------------------------------------------------------------------
-- Audit log (append-only)
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id               bigint generated always as identity primary key,
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  actor_id         uuid references auth.users (id) on delete set null,
  action           text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type      text not null,
  entity_id        uuid,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);

create or replace function private.log_audit(
  p_organization_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_organization_id, auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
$$;

-- Generic row-level audit trigger: tg_argv[0] is the entity name ("shop").
-- Records which columns changed on UPDATE. Skips rows whose organization is
-- being deleted (cascade), since the audit row would reference a missing org.
create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row    jsonb := to_jsonb(coalesce(new, old));
  v_org_id uuid  := (v_row ->> 'organization_id')::uuid;
  v_meta   jsonb := '{}'::jsonb;
begin
  if not exists (select 1 from public.organizations where id = v_org_id) then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    select jsonb_build_object('changed', coalesce(jsonb_object_agg(n.key, n.value), '{}'::jsonb))
    into v_meta
    from jsonb_each(to_jsonb(new)) n
    where n.key not in ('updated_at')
      and to_jsonb(old) -> n.key is distinct from n.value;

    if v_meta -> 'changed' = '{}'::jsonb then
      return new;
    end if;
  end if;

  perform private.log_audit(
    v_org_id,
    tg_argv[0] || '.' || case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end,
    tg_argv[0],
    (v_row ->> 'id')::uuid,
    v_meta
  );
  return coalesce(new, old);
end;
$$;

-- -----------------------------------------------------------------------------
-- Authorization helpers (SECURITY DEFINER so policies don't recurse into RLS)
-- -----------------------------------------------------------------------------
create or replace function private.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.has_org_role(p_organization_id uuid, p_roles public.org_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
  );
$$;

-- Shop-level access. Takes the organization id from the row being checked
-- instead of looking the shop up, so it also works inside INSERT ... RETURNING
-- (where a STABLE function cannot yet see the row being inserted).
create or replace function private.can_access_shop(p_organization_id uuid, p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and (
        m.role in ('owner', 'admin')
        or m.all_shops
        or exists (
          select 1 from public.member_shop_access a
          where a.member_id = m.id and a.shop_id = p_shop_id
        )
      )
  );
$$;

-- Convenience overload for tables that only carry a shop id.
create or replace function private.can_access_shop(p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.can_access_shop(s.organization_id, s.id) from public.shops s where s.id = p_shop_id),
    false
  );
$$;

create or replace function private.shares_org_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_user_id
  );
$$;

grant execute on all functions in schema private to authenticated, service_role;

create trigger shops_audit
  after insert or update or delete on public.shops
  for each row execute function private.audit_row_change('shop');

create trigger warehouses_audit
  after insert or update or delete on public.warehouses
  for each row execute function private.audit_row_change('warehouse');

create trigger organization_members_audit
  after insert or update or delete on public.organization_members
  for each row execute function private.audit_row_change('member');

-- -----------------------------------------------------------------------------
-- Guard: an organization must always keep at least one owner.
-- -----------------------------------------------------------------------------
create or replace function private.ensure_owner_remains()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_org uuid := old.organization_id;
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and not exists (
       select 1 from public.organization_members
       where organization_id = v_org and role = 'owner' and id <> old.id
     )
     -- Allow cascades when the whole organization is being deleted.
     and exists (select 1 from public.organizations where id = v_org)
  then
    raise exception 'An organization must keep at least one owner'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger organization_members_keep_owner
  before update of role or delete on public.organization_members
  for each row execute function private.ensure_owner_remains();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles                 enable row level security;
alter table public.organizations            enable row level security;
alter table public.organization_members     enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.shops                    enable row level security;
alter table public.member_shop_access       enable row level security;
alter table public.warehouses               enable row level security;
alter table public.shop_warehouses          enable row level security;
alter table public.audit_logs               enable row level security;

-- profiles
create policy "profiles: read self and teammates" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_org_with(id));

create policy "profiles: update self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- organizations (created only through public.create_organization)
create policy "organizations: members read" on public.organizations
  for select to authenticated
  using (private.is_org_member(id));

create policy "organizations: owners and admins update" on public.organizations
  for update to authenticated
  using (private.has_org_role(id, array['owner', 'admin']::public.org_role[]))
  with check (private.has_org_role(id, array['owner', 'admin']::public.org_role[]));

-- organization_members
create policy "members: teammates read" on public.organization_members
  for select to authenticated
  using (private.is_org_member(organization_id));

create policy "members: admins update" on public.organization_members
  for update to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]))
  with check (
    private.has_org_role(organization_id, array['owner', 'admin']::public.org_role[])
    -- Only owners can grant ownership.
    and (role <> 'owner' or private.has_org_role(organization_id, array['owner']::public.org_role[]))
  );

create policy "members: admins remove, anyone leaves" on public.organization_members
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_org_role(organization_id, array['owner', 'admin']::public.org_role[])
  );

-- organization_invitations
create policy "invitations: admins manage" on public.organization_invitations
  for all to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

-- shops
create policy "shops: read with access" on public.shops
  for select to authenticated
  using (private.can_access_shop(organization_id, id));

create policy "shops: admins create" on public.shops
  for insert to authenticated
  with check (private.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

create policy "shops: admins update" on public.shops
  for update to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

create policy "shops: owners delete" on public.shops
  for delete to authenticated
  using (private.has_org_role(organization_id, array['owner']::public.org_role[]));

-- member_shop_access
create policy "shop access: teammates read" on public.member_shop_access
  for select to authenticated
  using (private.can_access_shop(shop_id));

create policy "shop access: admins manage" on public.member_shop_access
  for all to authenticated
  using (exists (
    select 1 from public.shops s
    where s.id = shop_id
      and private.has_org_role(s.organization_id, array['owner', 'admin']::public.org_role[])
  ))
  with check (exists (
    select 1 from public.shops s
    where s.id = shop_id
      and private.has_org_role(s.organization_id, array['owner', 'admin']::public.org_role[])
  ));

-- warehouses
create policy "warehouses: members read" on public.warehouses
  for select to authenticated
  using (private.is_org_member(organization_id));

create policy "warehouses: managers write" on public.warehouses
  for all to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]));

-- shop_warehouses
create policy "shop warehouses: members read" on public.shop_warehouses
  for select to authenticated
  using (private.is_org_member(organization_id));

create policy "shop warehouses: managers write" on public.shop_warehouses
  for all to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]));

-- audit_logs: readable by owners/admins, written only via private.log_audit()
create policy "audit logs: admins read" on public.audit_logs
  for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

-- -----------------------------------------------------------------------------
-- Onboarding RPC: creates organization + owner membership + first shop +
-- first warehouse atomically. Exposed to authenticated users only.
-- -----------------------------------------------------------------------------
create or replace function public.create_organization(
  p_name           text,
  p_slug           text,
  p_shop_name      text,
  p_shop_slug      text,
  p_currency       text,
  p_warehouse_name text,
  p_warehouse_code text,
  p_warehouse_city text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id      uuid := auth.uid();
  v_org_id       uuid;
  v_shop_id      uuid;
  v_warehouse_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Cheap abuse guard: one user cannot create unlimited organizations.
  if (select count(*) from public.organizations where created_by = v_user_id) >= 10 then
    raise exception 'Organization limit reached' using errcode = 'check_violation';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (trim(p_name), lower(p_slug), v_user_id)
  returning id into v_org_id;

  insert into public.organization_members (organization_id, user_id, role, all_shops)
  values (v_org_id, v_user_id, 'owner', true);

  insert into public.shops (organization_id, name, slug, currency, status)
  values (v_org_id, trim(p_shop_name), lower(p_shop_slug), upper(p_currency), 'draft')
  returning id into v_shop_id;

  insert into public.warehouses (organization_id, name, code, address)
  values (
    v_org_id,
    trim(p_warehouse_name),
    upper(p_warehouse_code),
    jsonb_build_object('city', nullif(trim(p_warehouse_city), ''))
  )
  returning id into v_warehouse_id;

  insert into public.shop_warehouses (organization_id, shop_id, warehouse_id, priority)
  values (v_org_id, v_shop_id, v_warehouse_id, 1);

  perform private.log_audit(v_org_id, 'organization.created', 'organization', v_org_id,
    jsonb_build_object('shop_id', v_shop_id, 'warehouse_id', v_warehouse_id));

  return jsonb_build_object(
    'organization_id', v_org_id,
    'organization_slug', lower(p_slug),
    'shop_id', v_shop_id,
    'warehouse_id', v_warehouse_id
  );
end;
$$;

revoke all on function public.create_organization(text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text, text, text, text, text, text) to authenticated;
