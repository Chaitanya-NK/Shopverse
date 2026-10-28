-- =============================================================================
-- Shopverse billing: subscriptions, invoices, grace periods, admin console.
-- Runs in a transaction and rolls back.
-- =============================================================================
begin;

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  execute case when p_user is null then 'set local role anon' else 'set local role authenticated' end;
end $$;

create function pg_temp.assert(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'ASSERTION FAILED: %', p_msg; end if;
end $$;

create function pg_temp.expect_error(p_sql text, p_state text, p_msg text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ASSERTION FAILED (no error): %', p_msg;
exception when others then
  if sqlstate = 'P0001' and sqlerrm like 'ASSERTION FAILED%' then raise; end if;
  if sqlstate <> p_state then
    raise exception 'ASSERTION FAILED: % (expected %, got % %)', p_msg, p_state, sqlstate, sqlerrm;
  end if;
end $$;

create function pg_temp.as_server() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  set local role service_role;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@retail.test', '{"full_name":"Owner"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@retail.test', '{"full_name":"Admin"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'ops@shopverse.test', '{"full_name":"Ops"}');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
create temp table o on commit drop as
  select (public.create_organization('Mega Retail', 'mega-retail', 'Mega Store', 'mega-store', 'INR',
          'Bengaluru WH', 'BLR', 'Bengaluru', array['fashion']) ->> 'organization_id')::uuid as org;
grant select on o to authenticated, service_role, anon;
reset role;
insert into public.organization_members (organization_id, user_id, role)
values ((select org from o), '00000000-0000-0000-0000-0000000000a2', 'admin');
create temp table seller on commit drop as select
  '{"legal_name":"Shopverse Technologies Pvt Ltd","gstin":"29AAACS1234A1Z5","line1":"1 MG Road","city":"Bengaluru","state":"Karnataka","postal_code":"560001"}'::jsonb as j;
grant select on seller to service_role;
create temp table fy on commit drop as select private.financial_year(now()) as y;
grant select on fy to service_role, authenticated;

-- ---------------------------------------------------------------------------
-- The plan can't be changed through the API
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error(format($q$update public.organizations set plan = 'scale' where id = %L$q$, (select org from o)),
  '42501', 'owners cannot give themselves a plan');
select pg_temp.expect_error(format($q$update public.organizations set trial_ends_at = now() + interval '10 years' where id = %L$q$, (select org from o)),
  '42501', 'or extend their trial');
update public.organizations set name = 'Mega Retail India' where id = (select org from o);
select pg_temp.assert((select name = 'Mega Retail India' from public.organizations where id = (select org from o)), 'the name is editable');

-- ---------------------------------------------------------------------------
-- Billing details
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_error(format($q$select public.save_billing_profile(%L, '{"legal_name":"X","email":"a@b.co","state":"Kerala"}')$q$,
  (select org from o)), '42501', 'only owners change billing details');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error(format($q$select public.save_billing_profile(%L, '{"legal_name":"X","email":"a@b.co","state":"Kerala","gstin":"BAD"}')$q$,
  (select org from o)), '23514', 'GSTIN checked');
select public.save_billing_profile((select org from o),
  '{"legal_name":"Mega Retail Pvt Ltd","email":"Accounts@Mega.in","state":"Maharashtra","gstin":"27abcde1234f1z5","city":"Pune"}');
select pg_temp.assert(
  (select billing_profile ->> 'gstin' = '27ABCDE1234F1Z5' and billing_profile ->> 'email' = 'accounts@mega.in'
   from public.organizations where id = (select org from o)), 'normalised');

-- Plan functions are server-only.
select pg_temp.expect_error($q$select public.sync_subscription('sub_x', 'active', 'plan_x', now(), now())$q$, '42501',
  'browsers cannot sync subscriptions');

-- ---------------------------------------------------------------------------
-- Subscribe to Growth monthly
-- ---------------------------------------------------------------------------
select pg_temp.as_server();
select public.save_provider_plan('growth', 'monthly', 2999, 3538.82, 'plan_growth_m');
select public.save_provider_plan('starter', 'monthly', 999, 1178.82, 'plan_starter_m');
select public.save_provider_plan('scale', 'monthly', 7999, 9438.82, 'plan_scale_m');
select pg_temp.assert(public.platform_provider_plan('growth', 'monthly', 2999) = 'plan_growth_m', 'plans cached');
select public.begin_subscription((select org from o), '00000000-0000-0000-0000-0000000000a1', 'growth', 'monthly', 2999, 3538.82,
  'sub_1', 'https://rzp.io/i/x');
-- An abandoned checkout doesn't block another.
select public.begin_subscription((select org from o), '00000000-0000-0000-0000-0000000000a1', 'growth', 'monthly', 2999, 3538.82,
  'sub_2', 'https://rzp.io/i/y');
select pg_temp.assert((select status = 'expired' from public.subscriptions where provider_subscription_id = 'sub_1'),
  'the abandoned one expires');
select public.sync_subscription('sub_2', 'active', 'plan_growth_m', now(), now() + interval '30 days');
select pg_temp.assert(
  (select plan = 'growth' and plan_interval = 'monthly' and plan_renews_at > now() + interval '29 days' and past_due_since is null
   from public.organizations where id = (select org from o)),
  'activation sets the plan');
select pg_temp.expect_error(format($q$select public.begin_subscription(%L, null, 'scale', 'monthly', 7999, 9438.82, 'sub_3', null)$q$,
  (select org from o)), '23514', 'one live subscription per business');

-- The charge: an inter-state B2B invoice (seller Karnataka, buyer Maharashtra).
create temp table inv on commit drop as
  select public.record_platform_charge('sub_2', 'pay_1', 3538.82, (select j from seller), 18, '997331') as id;
select public.record_platform_charge('sub_2', 'pay_1', 3538.82, (select j from seller), 18, '997331');
grant select on inv to authenticated;
select pg_temp.assert(
  (select number = 'SV' || (select y from fy) || '-00001' and taxable = 2999 and igst = 539.82 and cgst = 0
          and total = 3538.82 and buyer ->> 'gstin' = '27ABCDE1234F1Z5' and plan = 'growth'
   from public.platform_invoices where id = (select id from inv))
  and (select count(*) = 1 from public.platform_invoices),
  'one invoice per payment: IGST across states, buyer GSTIN kept');

-- ---------------------------------------------------------------------------
-- Owners and admins see billing; staff don't
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.assert((select count(*) = 2 from public.subscriptions) and (select count(*) = 1 from public.platform_invoices),
  'admins read subscriptions and invoices');
select pg_temp.assert((public.platform_invoice((select id from inv)) ->> 'number') is not null, 'and the invoice document');
select pg_temp.assert(
  (select (j -> 'subscription' ->> 'status') = 'active' and j ->> 'interval' = 'monthly' and (j -> 'profile' ->> 'gstin') is not null
   from (select public.get_billing_overview((select org from o)) as j) x),
  'billing overview shows the subscription');

-- ---------------------------------------------------------------------------
-- Upgrade now, downgrade at renewal (only if it fits)
-- ---------------------------------------------------------------------------
select pg_temp.as_server();
select public.change_subscription_plan('sub_2', 'scale', 'monthly', 7999, 9438.82, true);
select pg_temp.assert((select plan = 'scale' from public.organizations where id = (select org from o)), 'upgrades apply at once');
select public.change_subscription_plan('sub_2', 'starter', 'monthly', 999, 1178.82, false);
select pg_temp.assert(
  (select g.plan = 'scale' and s.scheduled_plan = 'starter' from public.organizations g join public.subscriptions s on s.organization_id = g.id
   where s.provider_subscription_id = 'sub_2'),
  'downgrades wait for the renewal');
-- Renewal on the new plan clears the schedule.
select public.sync_subscription('sub_2', 'active', 'plan_starter_m', now() + interval '30 days', now() + interval '60 days');
select pg_temp.assert(
  (select g.plan = 'starter' and s.scheduled_plan is null and s.amount = 1178.82 and s.base_amount = 999
   from public.organizations g join public.subscriptions s on s.organization_id = g.id where s.provider_subscription_id = 'sub_2'),
  'the renewal moves to Starter');

-- Starter allows one shop; with two, Starter shows an overage.
reset role;
insert into public.shops (organization_id, name, slug, currency) values ((select org from o), 'Second', 'second-shop', 'INR');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert(
  (select jsonb_array_length(j -> 'overages' -> 'starter') = 1 and j -> 'overages' -> 'starter' -> 0 ->> 'resource' = 'shops'
          and jsonb_array_length(j -> 'overages' -> 'growth') = 0
   from (select public.get_billing_overview((select org from o)) as j) x),
  'overages per plan');

-- ---------------------------------------------------------------------------
-- Failed renewal: 7 days of grace, then growth stops (selling doesn't)
-- ---------------------------------------------------------------------------
select pg_temp.as_server();
select public.sync_subscription('sub_2', 'pending', 'plan_starter_m', null, null);
select pg_temp.assert((select past_due_since is not null from public.organizations where id = (select org from o)), 'past due');
reset role;
update public.organizations set plan = 'scale' where id = (select org from o);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select public.create_product((select org from o), '{"title":"Tee","slug":"tee","status":"active"}', '[{"sku":"T1","price":100}]');
reset role;
update public.organizations set past_due_since = now() - interval '8 days' where id = (select org from o);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error(format($q$select public.create_product(%L, '{"title":"Cap","slug":"cap","status":"active"}', '[{"sku":"C1","price":100}]')$q$,
  (select org from o)), '23514', 'after the grace period, no new products');
select pg_temp.as_server();
select public.sync_subscription('sub_2', 'active', 'plan_starter_m', now(), now() + interval '30 days');
select pg_temp.assert((select past_due_since is null from public.organizations where id = (select org from o)),
  'a successful retry clears it');

-- Cancelling at period end, then the end.
select public.mark_subscription_cancelling('sub_2');
select pg_temp.assert((select cancel_at_period_end from public.subscriptions where provider_subscription_id = 'sub_2'), 'cancelling');
select public.sync_subscription('sub_2', 'cancelled', 'plan_starter_m', null, null);
select pg_temp.assert(
  (select plan = 'trial' and trial_ends_at <= now() and plan_interval is null from public.organizations where id = (select org from o)),
  'when the plan ends, growth stops like an ended trial');
select pg_temp.assert((public.sync_subscription('sub_2', 'active', 'plan_starter_m', null, null) ->> 'status') = 'cancelled',
  'a finished subscription stays finished');
select pg_temp.assert(
  (select count(*) >= 4 from public.audit_logs where organization_id = (select org from o) and action like 'subscription.%'),
  'audited');

-- ---------------------------------------------------------------------------
-- Platform admin console
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert(public.is_platform_admin() = false, 'owners are not platform admins');
select pg_temp.expect_error($q$select public.admin_overview()$q$, 'P0002', 'the console is hidden from everyone else');
select pg_temp.expect_error(format($q$select public.admin_extend_trial(%L, 7)$q$, (select org from o)), 'P0002',
  'and its actions');

reset role;
insert into private.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000c1');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(public.is_platform_admin(), 'admin');
select pg_temp.assert(
  (select (j ->> 'businesses')::int >= 1 and (j ->> 'billed_30d')::numeric >= 3538.82 from (select public.admin_overview() as j) x),
  'overview');
select pg_temp.assert(
  (select (j ->> 'total')::int = 1 and j -> 'items' -> 0 ->> 'owner_email' = 'owner@retail.test'
   from (select public.admin_organizations('owner@retail', null) as j) x),
  'search by owner email');
select pg_temp.assert(
  (select jsonb_array_length(j -> 'members') = 2 and jsonb_array_length(j -> 'invoices') = 1
   from (select public.admin_organization((select org from o)) as j) x),
  'business detail');
select public.admin_extend_trial((select org from o), 14);
reset role;
select pg_temp.assert((select trial_ends_at > now() + interval '13 days' from public.organizations where id = (select org from o)),
  'trial extended from today');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect_error(format($q$select public.admin_set_plan(%L, 'growth', '  ')$q$, (select org from o)), '23514',
  'manual plans need a reason');
select public.admin_set_plan((select org from o), 'growth', 'Launch partner deal');
reset role;
select pg_temp.assert(
  exists (select 1 from public.audit_logs where organization_id = (select org from o) and action = 'admin.plan_set'
          and actor_id = '00000000-0000-0000-0000-0000000000c1' and metadata ->> 'note' = 'Launch partner deal'),
  'admin actions are audited on the business');

\echo ALL PLATFORM BILLING TESTS PASSED
rollback;
