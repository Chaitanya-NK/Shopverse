-- =============================================================================
-- Team invitations, member management rules, plan limits and the audit view.
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

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@retail.test', '{"full_name":"Asha Owner"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'bina@retail.test', '{"full_name":"Bina Admin"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'chetan@retail.test', '{"full_name":"Chetan Staff"}'),
  ('00000000-0000-0000-0000-0000000000d1', 'dev@else.test', '{"full_name":"Dev Outsider"}');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
create temp table o on commit drop as
  select (public.create_organization('Mega Retail', 'mega-retail', 'Mega Store', 'mega-store', 'INR',
          'Bengaluru WH', 'BLR', 'Bengaluru', array['fashion']) ->> 'organization_id')::uuid as org;
insert into public.shops (organization_id, name, slug) select org, 'Mega Outlet', 'mega-outlet' from o;
create temp table ids on commit drop as select
  (select org from o) as org,
  (select id from public.shops where slug = 'mega-store') as shop1,
  (select id from public.shops where slug = 'mega-outlet') as shop2;
grant select on o, ids to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
create temp table inv_b on commit drop as
  select public.invite_member((select org from ids), ' Bina@Retail.test ', 'admin') as j;
grant select on inv_b to anon, authenticated;
select pg_temp.assert((select j ->> 'token' ~ '^[0-9a-f]{64}$' from inv_b), 'invite returns a 64-hex token once');

do $$
begin
  perform token_hash from public.organization_invitations;
  raise exception 'ASSERTION FAILED: token hashes must not be readable';
exception when insufficient_privilege then null;
end $$;

select pg_temp.act_as(null);
select pg_temp.assert(
  (select (public.get_invitation(j ->> 'token')) ->> 'status' = 'pending'
      and (public.get_invitation(j ->> 'token')) -> 'organization' ->> 'name' = 'Mega Retail'
      and (public.get_invitation(j ->> 'token')) ->> 'invited_by' = 'Asha Owner' from inv_b),
  'anyone with the link can see what the invitation is for');
select pg_temp.assert(public.get_invitation(repeat('a', 64)) is null, 'unknown tokens reveal nothing');

-- Re-inviting refreshes the link: the old one stops working.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
create temp table inv_b2 on commit drop as
  select public.invite_member((select org from ids), 'bina@retail.test', 'admin') as j;
grant select on inv_b2 to anon, authenticated;
select pg_temp.assert(public.get_invitation((select j ->> 'token' from inv_b)) is null, 'old link no longer works');
select pg_temp.assert((select count(*) = 1 from public.organization_invitations where accepted_at is null),
  'still one pending invitation per email');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select pg_temp.expect_error(format($q$select public.accept_invitation(%L)$q$, (select j ->> 'token' from inv_b2)),
  '42501', 'only the invited email can accept');
select pg_temp.expect_error(format($q$select public.invite_member(%L, 'x@y.test', 'staff')$q$, (select org from ids)),
  '42501', 'outsiders cannot invite');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert(
  (select public.accept_invitation(j ->> 'token') ->> 'organization_slug' = 'mega-retail' from inv_b2),
  'the invitee accepts');
select pg_temp.assert((select role = 'admin' from public.organization_members where user_id = auth.uid()), 'joined as admin');
select pg_temp.expect_error(format($q$select public.accept_invitation(%L)$q$, (select j ->> 'token' from inv_b2)),
  'P0002', 'a link works once');

-- Restricted staff invite (admin invites)
create temp table inv_c on commit drop as
  select public.invite_member((select org from ids), 'chetan@retail.test', 'staff', false, array[(select shop2 from ids)]) as j;
grant select on inv_c to anon, authenticated;
select pg_temp.expect_error(format($q$select public.invite_member(%L, 'owner2@x.test', 'owner')$q$, (select org from ids)),
  '23514', 'nobody is invited straight in as owner');
select pg_temp.expect_error(format($q$select public.invite_member(%L, 'owner@retail.test', 'staff')$q$, (select org from ids)),
  '23505', 'existing members cannot be re-invited');
select pg_temp.expect_error(format($q$select public.invite_member(%L, 'z@x.test', 'staff', false, '{}')$q$, (select org from ids)),
  '23514', 'restricted access needs at least one shop');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select public.accept_invitation((select j ->> 'token' from inv_c));
select pg_temp.assert((select array_agg(slug) = array['mega-outlet'] from public.shops), 'restricted staff sees only their shop');

-- ---------------------------------------------------------------------------
-- Member rules
-- ---------------------------------------------------------------------------
create temp table m on commit drop as select
  (select id from public.organization_members where user_id = '00000000-0000-0000-0000-0000000000a1') as a,
  (select id from public.organization_members where user_id = '00000000-0000-0000-0000-0000000000b1') as b,
  (select id from public.organization_members where user_id = '00000000-0000-0000-0000-0000000000c1') as c;
grant select on m to authenticated;

select pg_temp.expect_error(format($q$select public.update_member(%L, 'admin', true)$q$, (select c from m)),
  '42501', 'staff cannot change roles');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select pg_temp.expect_error(format($q$select public.update_member(%L, 'staff', true)$q$, (select a from m)),
  '42501', 'admins cannot demote owners');
select pg_temp.expect_error(format($q$select public.update_member(%L, 'owner', true)$q$, (select c from m)),
  '42501', 'admins cannot create owners');
select pg_temp.expect_error(format($q$select public.update_member(%L, 'owner', true)$q$, (select b from m)),
  '42501', 'nobody edits their own role');
select pg_temp.expect_error(format($q$select public.remove_member(%L)$q$, (select a from m)),
  '42501', 'admins cannot remove owners');
select pg_temp.expect_error(format($q$select public.update_member(%L, 'admin', false, array[%L]::uuid[])$q$, (select c from m), (select shop1 from ids)),
  '23514', 'admins always see every shop');

select public.update_member((select c from m), 'manager', false, array[(select shop1 from ids), (select shop2 from ids)]);
select pg_temp.assert(
  (select role = 'manager' and cardinality(shop_ids) = 2 from public.team_overview where id = (select c from m)),
  'admins can change roles and shop access of non-owners');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select public.update_member((select b from m), 'owner', true);
select pg_temp.assert((select count(*) = 2 from public.organization_members where role = 'owner'), 'owners can promote to owner');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select public.remove_member((select c from m));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert((select count(*) = 2 from public.organization_members), 'anyone can leave');

-- ---------------------------------------------------------------------------
-- Plan limits (trial: 2 shops, 5 seats)
-- ---------------------------------------------------------------------------
select pg_temp.expect_error(format($q$insert into public.shops (organization_id, name, slug) values (%L, 'Third', 'mega-third')$q$,
  (select org from ids)), '23514', 'the trial allows two shops');

select public.invite_member((select org from ids), 'p' || g || '@x.test', 'staff') from generate_series(1, 3) g;
select pg_temp.expect_error(format($q$select public.invite_member(%L, 'p4@x.test', 'staff')$q$, (select org from ids)),
  '23514', 'members plus pending invitations are limited to the plan''s seats');
select public.revoke_invitation((select id from public.organization_invitations where email = 'p1@x.test'));
select public.invite_member((select org from ids), 'p4@x.test', 'staff');
select pg_temp.assert(true, 'revoking frees a seat');

create temp table bill on commit drop as select public.get_billing_overview((select org from ids)) as j;
select pg_temp.assert(
  (select j ->> 'plan' = 'trial' and (j -> 'usage' ->> 'shops')::int = 2 and (j -> 'usage' ->> 'seats')::int = 5
     and (j -> 'limits' ->> 'seats')::int = 5 and (j ->> 'trial_expired')::boolean = false from bill),
  'billing overview reports plan, limits and usage');

reset role;
update public.organizations set trial_ends_at = now() - interval '1 day' where id = (select org from ids);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error(format($q$select public.create_product(%L, '{"title":"Tee","slug":"tee","category_id":"%s"}', '[{"sku":"T-1","price":1,"options":{"size":"M"}}]')$q$,
  (select org from ids), (select id from public.categories where slug = 'clothing' and organization_id = (select org from ids))),
  '23514', 'an expired trial blocks adding products');

reset role;
update public.organizations set plan = 'scale' where id = (select org from ids);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
insert into public.shops (organization_id, name, slug) select org, 'Third', 'mega-third' from ids;
select pg_temp.assert(true, 'the Scale plan has no shop limit');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select pg_temp.expect_error(format($q$select public.get_billing_overview(%L)$q$, (select org from ids)),
  'P0002', 'outsiders cannot see billing');

-- ---------------------------------------------------------------------------
-- Audit log view
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert(
  (select count(*) >= 3 and bool_and(actor_name is not null) from public.audit_log_view
   where action in ('invitation.sent', 'invitation.accepted') and organization_id = (select org from ids)),
  'owners read the audit trail with actor names');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select pg_temp.assert((select count(*) = 0 from public.audit_log_view where organization_id = (select org from ids)),
  'outsiders read none of it');

select 'ALL TEAM & BILLING TESTS PASSED' as result;
rollback;
