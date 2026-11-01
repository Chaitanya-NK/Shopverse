-- =============================================================================
-- Hardening
--   * A job queue in Postgres for work that happens after a request: order
--     emails and WhatsApp/SMS updates, business emails and Stripe webhook
--     events. Jobs are claimed with SKIP LOCKED (no double processing across
--     workers), retried with exponential backoff, and parked as "dead" after
--     their last attempt for an admin to retry. Finished jobs drop their
--     payload, and are deleted after 14 days.
--   * Error tracking: errors from the server, background jobs and browsers are
--     grouped by fingerprint, counted and shown in the admin console.
--   * Storefront language: each shop has a default language (English or
--     Hindi); each order remembers the language the shopper used, so its
--     emails and messages arrive in that language.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Job queue
-- -----------------------------------------------------------------------------
create table private.jobs (
  id              bigint generated always as identity primary key,
  kind            text not null check (kind ~ '^[a-z][a-z0-9_.]{1,60}$'),
  payload         jsonb not null default '{}'::jsonb,
  status          text not null default 'queued' check (status in ('queued', 'running', 'done', 'dead')),
  attempts        integer not null default 0,
  max_attempts    integer not null default 6 check (max_attempts between 1 and 20),
  run_after       timestamptz not null default now(),
  locked_at       timestamptz,
  locked_by       text,
  last_error      text,
  -- Enqueueing the same key again while a job is waiting is a no-op.
  dedupe_key      text,
  organization_id uuid references public.organizations (id) on delete cascade,
  created_at      timestamptz not null default now(),
  finished_at     timestamptz
);
create index jobs_due_idx on private.jobs (run_after, id) where status = 'queued';
create index jobs_running_idx on private.jobs (locked_at) where status = 'running';
create index jobs_dead_idx on private.jobs (finished_at desc) where status = 'dead';
create index jobs_done_idx on private.jobs (finished_at) where status = 'done';
create unique index jobs_dedupe_uidx on private.jobs (dedupe_key) where dedupe_key is not null and status in ('queued', 'running');

create or replace function public.enqueue_job(
  p_kind text,
  p_payload jsonb default '{}'::jsonb,
  p_delay_seconds integer default 0,
  p_dedupe_key text default null,
  p_max_attempts integer default 6,
  p_organization_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into private.jobs (kind, payload, run_after, dedupe_key, max_attempts, organization_id)
  values (p_kind, coalesce(p_payload, '{}'::jsonb), now() + make_interval(secs => greatest(coalesce(p_delay_seconds, 0), 0)),
          p_dedupe_key, coalesce(p_max_attempts, 6), p_organization_id)
  on conflict (dedupe_key) where dedupe_key is not null and status in ('queued', 'running') do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from private.jobs
    where dedupe_key = p_dedupe_key and status in ('queued', 'running') limit 1;
  end if;
  return v_id;
end;
$$;

/*
 * Claims due jobs for one worker. A running job whose lease ran out (the
 * worker died) is claimed again. Also tidies up old finished jobs.
 */
create or replace function public.claim_jobs(p_worker text, p_limit integer default 10, p_lease_seconds integer default 300)
returns table (id bigint, kind text, payload jsonb, attempts integer, max_attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.jobs j
  where j.id in (select d.id from private.jobs d
                 where d.status = 'done' and d.finished_at < now() - interval '14 days' limit 500);

  return query
  with due as (
    select j.id from private.jobs j
    where (j.status = 'queued' and j.run_after <= now())
       or (j.status = 'running' and j.locked_at < now() - make_interval(secs => greatest(p_lease_seconds, 30)))
    order by j.run_after, j.id
    limit least(greatest(coalesce(p_limit, 10), 1), 100)
    for update skip locked
  )
  update private.jobs j
  set status = 'running', attempts = j.attempts + 1, locked_at = now(), locked_by = left(p_worker, 100)
  from due where j.id = due.id
  returning j.id, j.kind, j.payload, j.attempts, j.max_attempts;
end;
$$;

-- Done: the payload (which may hold personal details) is dropped.
create or replace function public.complete_job(p_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.jobs
  set status = 'done', payload = '{}'::jsonb, finished_at = now(), locked_at = null, last_error = null
  where id = p_id and status = 'running';
$$;

-- Failed: try again later (30s, 1m, 2m, 4m… up to 1h), or park it as dead after
-- the last attempt (or at once, for failures that retrying can't fix).
create or replace function public.fail_job(p_id bigint, p_error text, p_permanent boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.jobs;
begin
  select * into v_job from private.jobs where id = p_id and status = 'running' for update;
  if v_job.id is null then
    return null;
  end if;
  if v_job.attempts >= v_job.max_attempts or coalesce(p_permanent, false) then
    update private.jobs set status = 'dead', finished_at = now(), locked_at = null, last_error = left(p_error, 2000)
    where id = p_id;
    return 'dead';
  end if;
  update private.jobs
  set status = 'queued', locked_at = null, last_error = left(p_error, 2000),
      run_after = now() + make_interval(secs => least(30 * power(2, v_job.attempts - 1), 3600))
  where id = p_id;
  return 'retry';
end;
$$;

-- -----------------------------------------------------------------------------
-- Error tracking
-- -----------------------------------------------------------------------------
create table private.error_groups (
  fingerprint  text primary key check (fingerprint ~ '^[0-9a-f]{16,64}$'),
  source       text not null check (source in ('server', 'client', 'job', 'action')),
  message      text not null,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  count        integer not null default 1,
  resolved_at  timestamptz
);
create index error_groups_last_seen_idx on private.error_groups (last_seen desc);

create table private.error_events (
  id          bigint generated always as identity primary key,
  fingerprint text not null references private.error_groups (fingerprint) on delete cascade,
  created_at  timestamptz not null default now(),
  message     text not null,
  stack       text,
  path        text,
  method      text,
  request_id  text,
  digest      text,
  user_id     uuid,
  context     jsonb not null default '{}'::jsonb
);
create index error_events_group_idx on private.error_events (fingerprint, created_at desc);

/*
 * Records one error. Keeps the latest 50 events of a group (the count keeps
 * going up), and a resolved group that happens again is reopened. A flood is
 * capped: past 60 events a minute for one group, only the count changes.
 */
create or replace function public.record_error(
  p_fingerprint text,
  p_source text,
  p_message text,
  p_stack text default null,
  p_path text default null,
  p_method text default null,
  p_request_id text default null,
  p_digest text default null,
  p_user_id uuid default null,
  p_context jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.error_groups (fingerprint, source, message)
  values (p_fingerprint, p_source, left(coalesce(p_message, 'Error'), 500))
  on conflict (fingerprint) do update
  set count = private.error_groups.count + 1, last_seen = now(), resolved_at = null,
      message = excluded.message;

  if (select count(*) from private.error_events
      where fingerprint = p_fingerprint and created_at > now() - interval '1 minute') >= 60 then
    return;
  end if;

  insert into private.error_events (fingerprint, message, stack, path, method, request_id, digest, user_id, context)
  values (p_fingerprint, left(coalesce(p_message, 'Error'), 2000), left(p_stack, 8000), left(p_path, 500),
          left(p_method, 10), left(p_request_id, 100), left(p_digest, 100), p_user_id,
          case when octet_length(coalesce(p_context, '{}'::jsonb)::text) <= 8192 then coalesce(p_context, '{}'::jsonb) else '{}'::jsonb end);

  delete from private.error_events
  where fingerprint = p_fingerprint
    and id not in (select id from private.error_events where fingerprint = p_fingerprint order by id desc limit 50);
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin console: errors and jobs (platform admins only)
-- -----------------------------------------------------------------------------
create or replace function public.admin_errors(p_status text default 'open', p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'open', (select count(*) from private.error_groups where resolved_at is null),
    'last_24h', (select count(*) from private.error_events where created_at > now() - interval '24 hours'),
    'groups', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.last_seen desc)
      from (select * from private.error_groups
            where case p_status when 'resolved' then resolved_at is not null
                                when 'all' then true else resolved_at is null end
            order by last_seen desc limit least(greatest(p_limit, 1), 500)) g), '[]'::jsonb));
end;
$$;

create or replace function public.admin_error(p_fingerprint text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return (
    select to_jsonb(g) || jsonb_build_object('events', coalesce((
      select jsonb_agg(to_jsonb(e) - 'fingerprint' order by e.id desc)
      from private.error_events e where e.fingerprint = g.fingerprint), '[]'::jsonb))
    from private.error_groups g where g.fingerprint = p_fingerprint);
end;
$$;

create or replace function public.admin_resolve_error(p_fingerprint text, p_resolved boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update private.error_groups set resolved_at = case when p_resolved then now() end
  where fingerprint = p_fingerprint;
end;
$$;

create or replace function public.admin_jobs()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'counts', (select jsonb_build_object(
        'queued', count(*) filter (where status = 'queued'),
        'due', count(*) filter (where status = 'queued' and run_after <= now()),
        'running', count(*) filter (where status = 'running'),
        'dead', count(*) filter (where status = 'dead'),
        'done_24h', count(*) filter (where status = 'done' and finished_at > now() - interval '24 hours'))
      from private.jobs),
    'oldest_due', (select min(run_after) from private.jobs where status = 'queued' and run_after <= now()),
    'by_kind', coalesce((select jsonb_object_agg(kind, n) from (
        select kind, count(*) as n from private.jobs where status in ('queued', 'running', 'dead') group by kind) k), '{}'::jsonb),
    'problems', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'kind', kind, 'status', status, 'attempts', attempts, 'max_attempts', max_attempts,
        'last_error', last_error, 'run_after', run_after, 'created_at', created_at, 'finished_at', finished_at)
        order by coalesce(finished_at, run_after) desc)
      from (select * from private.jobs
            where status = 'dead' or (status = 'queued' and attempts > 0)
            order by coalesce(finished_at, run_after) desc limit 100) j), '[]'::jsonb));
end;
$$;

-- Give a dead (or waiting) job a fresh set of attempts, now.
create or replace function public.admin_retry_job(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update private.jobs
  set status = 'queued', attempts = 0, run_after = now(), finished_at = null, locked_at = null
  where id = p_id and status in ('dead', 'queued');
  if not found then
    raise exception 'Job not found' using errcode = 'no_data_found';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Storefront language
-- -----------------------------------------------------------------------------
alter table public.orders add column locale text check (locale in ('en', 'hi'));
grant select (locale) on public.orders to authenticated;

-- The language a shopper used, recorded by the storefront when the order is placed.
create or replace function public.set_order_locale(p_order_id uuid, p_locale text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.orders set locale = p_locale where id = p_order_id and p_locale in ('en', 'hi');
$$;

-- storefront_shop: adds the shop's language.
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
    'message_channel', private.shop_message_channel(v_shop.organization_id),
    -- The language shoppers see first (they can switch).
    'language', case when v_shop.settings ->> 'language' = 'hi' then 'hi' else 'en' end
  );
end;
$$;


-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function public.enqueue_job(text, jsonb, integer, text, integer, uuid) from public, anon, authenticated;
revoke all on function public.claim_jobs(text, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_job(bigint) from public, anon, authenticated;
revoke all on function public.fail_job(bigint, text, boolean) from public, anon, authenticated;
revoke all on function public.record_error(text, text, text, text, text, text, text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.set_order_locale(uuid, text) from public, anon, authenticated;
grant execute on function public.enqueue_job(text, jsonb, integer, text, integer, uuid) to service_role;
grant execute on function public.claim_jobs(text, integer, integer) to service_role;
grant execute on function public.complete_job(bigint) to service_role;
grant execute on function public.fail_job(bigint, text, boolean) to service_role;
grant execute on function public.record_error(text, text, text, text, text, text, text, text, uuid, jsonb) to service_role;
grant execute on function public.set_order_locale(uuid, text) to service_role;

revoke all on function public.admin_errors(text, integer) from public, anon;
revoke all on function public.admin_error(text) from public, anon;
revoke all on function public.admin_resolve_error(text, boolean) from public, anon;
revoke all on function public.admin_jobs() from public, anon;
revoke all on function public.admin_retry_job(bigint) from public, anon;
grant execute on function public.admin_errors(text, integer) to authenticated;
grant execute on function public.admin_error(text) to authenticated;
grant execute on function public.admin_resolve_error(text, boolean) to authenticated;
grant execute on function public.admin_jobs() to authenticated;
grant execute on function public.admin_retry_job(bigint) to authenticated;
