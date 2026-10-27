-- =============================================================================
-- Database behaviour tests: tenancy isolation, RLS, stock ledger, invariants.
-- Plain SQL with assertions: any failure raises and aborts.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_and_invariants.test.sql
--
-- Runs in a transaction and rolls back, so it is safe against a local database.
-- =============================================================================
begin;

-- Test helpers ----------------------------------------------------------------
create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  if p_user is null then
    execute 'set local role anon';
  else
    execute 'set local role authenticated';
  end if;
end $$;

create function pg_temp.assert(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'ASSERTION FAILED: %', p_msg; end if;
end $$;

-- Two users in separate tenants, plus a teammate ------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'priya@urbanthreads.test', '{"full_name":"Priya Sharma"}'),
  ('00000000-0000-0000-0000-00000000000b', 'rival@othershop.test',   '{"full_name":"Rival Owner"}'),
  ('00000000-0000-0000-0000-00000000000c', 'rahul@urbanthreads.test', '{"full_name":"Rahul Kumar"}');

select pg_temp.assert(
  (select count(*) = 3 from public.profiles), 'profiles are created for new auth users');
select pg_temp.assert(
  (select full_name = 'Priya Sharma' from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'profile copies full_name from signup metadata');

-- Onboarding ------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
create temp table a_org on commit drop as
  select public.create_organization('Urban Threads Retail', 'urban-threads', 'Urban Threads', 'urban-threads',
                                    'INR', 'Bengaluru WH', 'BLR', 'Bengaluru') as r;
grant all on a_org to authenticated;

select pg_temp.assert((select count(*) = 1 from public.organizations), 'owner sees their organization');
select pg_temp.assert((select count(*) = 1 from public.shops), 'owner sees their shop');
select pg_temp.assert((select count(*) = 1 from public.warehouses), 'owner sees their warehouse');
select pg_temp.assert((select role = 'owner' from public.organization_members), 'creator is owner');
select pg_temp.assert((select count(*) = 1 from public.audit_logs where action = 'organization.created'), 'onboarding is audited');

-- Regression: INSERT ... RETURNING (what PostgREST does for .insert().select())
-- must pass the SELECT policy for the row just created.
create temp table returned_shop on commit drop as
  with ins as (
    insert into public.shops (organization_id, name, slug)
    select (r ->> 'organization_id')::uuid, 'Urban Threads Kids', 'urban-threads-kids' from a_org
    returning id, slug
  ) select * from ins;
select pg_temp.assert((select slug = 'urban-threads-kids' from returned_shop), 'owner can insert a shop and read it back');

-- Shop and warehouse writes are audited by trigger, including which columns changed
update public.shops set status = 'live' where slug = 'urban-threads';
select pg_temp.assert(
  (select count(*) = 2 from public.audit_logs where action = 'shop.created'), 'shop creation is audited');
select pg_temp.assert(
  (select metadata -> 'changed' ->> 'status' = 'live' from public.audit_logs where action = 'shop.updated'),
  'shop update audit records the changed column');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select public.create_organization('Other Shop', 'other-shop', 'Other', 'other', 'INR', 'Main', 'MAIN', 'Pune');

-- Isolation: B sees only their own tenant
select pg_temp.assert((select count(*) = 1 from public.organizations), 'B sees exactly one organization');
select pg_temp.assert((select slug = 'other-shop' from public.organizations), 'B sees only their own organization');
select pg_temp.assert((select count(*) = 0 from public.shops where slug = 'urban-threads'), 'B cannot see A''s shop');
select pg_temp.assert((select count(*) = 0 from public.audit_logs where action = 'organization.created'
                        and organization_id = (select (r ->> 'organization_id')::uuid from a_org)),
  'B cannot read A''s audit log');

-- B cannot write into A's organization
do $$
begin
  insert into public.shops (organization_id, name, slug)
  values ((select (r ->> 'organization_id')::uuid from a_org), 'Hijack', 'hijack');
  raise exception 'ASSERTION FAILED: cross-tenant shop insert should be rejected';
exception when insufficient_privilege then null; -- RLS violation (42501)
end $$;

-- Duplicate slug is rejected with a unique violation the app can map to a field error
do $$
begin
  perform public.create_organization('Dup', 'urban-threads', 'Dup', 'dup', 'INR', 'W', 'W1', 'X');
  raise exception 'ASSERTION FAILED: duplicate organization slug should fail';
exception when unique_violation then null;
end $$;

-- Anonymous users cannot create organizations
select pg_temp.act_as(null);
do $$
begin
  perform public.create_organization('Anon', 'anon-org', 'Anon', 'anon', 'INR', 'W', 'W1', 'X');
  raise exception 'ASSERTION FAILED: anon must not create organizations';
exception when insufficient_privilege then null;
end $$;

-- Catalog & stock ledger --------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
create temp table ids on commit drop as
with p as (
  insert into public.products (organization_id, title, slug, status)
  values ((select (r ->> 'organization_id')::uuid from a_org), 'Linen shirt', 'linen-shirt', 'active')
  returning id, organization_id
), v as (
  insert into public.product_variants (organization_id, product_id, sku, title, price)
  select organization_id, id, 'UT-LIN-OLV-M', 'Olive / M', 1899 from p
  returning id
)
select (select id from v) as variant_id, (select (r ->> 'warehouse_id')::uuid from a_org) as warehouse_id;
grant all on ids to authenticated;

select public.adjust_stock((select variant_id from ids), (select warehouse_id from ids), 10, 'receipt', 'Initial stock');
select public.adjust_stock((select variant_id from ids), (select warehouse_id from ids), -3, 'adjustment', 'Stock count');

select pg_temp.assert(
  (select on_hand = 7 and available = 7 from public.inventory_levels where variant_id = (select variant_id from ids)),
  'on_hand reflects receipts and adjustments');
select pg_temp.assert(
  (select array_agg(balance_after order by id) = array[10, 7] from public.stock_movements),
  'ledger records running balance');

do $$
begin
  perform public.adjust_stock((select variant_id from ids), (select warehouse_id from ids), -20, 'adjustment');
  raise exception 'ASSERTION FAILED: stock must not go negative';
exception when check_violation then null;
end $$;

-- Clients cannot bypass the ledger by editing on_hand directly...
do $$
begin
  update public.inventory_levels set on_hand = 999 where variant_id = (select variant_id from ids);
  raise exception 'ASSERTION FAILED: direct on_hand update should be denied';
exception when insufficient_privilege then null;
end $$;
-- ...but may tune the reorder point.
update public.inventory_levels set reorder_point = 5 where variant_id = (select variant_id from ids);
select pg_temp.assert(
  (select reorder_point = 5 from public.inventory_levels where variant_id = (select variant_id from ids)),
  'reorder_point is editable');

-- Another tenant cannot adjust A's stock
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
do $$
begin
  perform public.adjust_stock((select variant_id from ids), (select warehouse_id from ids), 5, 'receipt');
  raise exception 'ASSERTION FAILED: cross-tenant stock adjustment should be denied';
exception when insufficient_privilege then null;
end $$;

-- Per-shop access for restricted staff ------------------------------------------
reset role;
insert into public.organization_members (organization_id, user_id, role, all_shops)
values ((select (r ->> 'organization_id')::uuid from a_org), '00000000-0000-0000-0000-00000000000c', 'staff', false);

select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert((select count(*) = 1 from public.organizations), 'restricted staff sees the organization');
select pg_temp.assert((select count(*) = 0 from public.shops), 'restricted staff sees no shops until granted');

reset role;
insert into public.member_shop_access (member_id, shop_id)
select m.id, (select (r ->> 'shop_id')::uuid from a_org)
from public.organization_members m where m.user_id = '00000000-0000-0000-0000-00000000000c';

select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert((select count(*) = 1 from public.shops), 'granted shop becomes visible');
select pg_temp.assert(
  (select count(*) = 2 from public.profiles), 'teammates can see each other''s profiles (and not other tenants)');

-- Staff cannot promote themselves
do $$
begin
  update public.organization_members set role = 'owner' where user_id = '00000000-0000-0000-0000-00000000000c';
  if found then raise exception 'ASSERTION FAILED: staff must not change roles'; end if;
end $$;

-- Orders & shipments -----------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.orders (organization_id, shop_id, grand_total)
select (r ->> 'organization_id')::uuid, (r ->> 'shop_id')::uuid, 1899 from a_org;
insert into public.orders (organization_id, shop_id, grand_total)
select (r ->> 'organization_id')::uuid, (r ->> 'shop_id')::uuid, 999 from a_org;

select pg_temp.assert(
  (select array_agg(number order by number) = array['ORD-000001', 'ORD-000002'] from public.orders),
  'order numbers are sequential per organization');

insert into public.shipments (organization_id, order_id, warehouse_id, delivery_otp_hash)
select o.organization_id, o.id, (select warehouse_id from ids), 'hash'
from public.orders o where o.number = 'ORD-000001';

do $$
begin
  perform delivery_otp_hash from public.shipments;
  raise exception 'ASSERTION FAILED: delivery OTP hash must not be readable by clients';
exception when insufficient_privilege then null;
end $$;
select pg_temp.assert((select count(*) = 1 from (select id, status from public.shipments) s), 'shipment visible without the OTP column');

-- Dashboard stats respect RLS ---------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select pg_temp.assert(
  (select (public.get_overview_stats((select (r ->> 'organization_id')::uuid from a_org)) ->> 'orders_24h')::int = 2),
  'owner sees both orders in stats');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select pg_temp.assert(
  (select (public.get_overview_stats((select (r ->> 'organization_id')::uuid from a_org)) ->> 'orders_24h')::int = 0),
  'another tenant gets zeros for an organization they do not belong to');

-- Multi-vertical catalogue -------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
create temp table b_multi on commit drop as
  select public.create_organization('Gadget & Home', 'gadget-home', 'Gadget & Home', 'gadget-home',
                                    'INR', 'Pune WH', 'PUNE', 'Pune', array['electronics', 'home_kitchen']) as r;
grant all on b_multi to authenticated;

select pg_temp.assert(
  (select industries = array['electronics', 'home_kitchen'] from public.organizations where slug = 'gadget-home'),
  'industries are recorded on the organization');
select pg_temp.assert(
  (select count(*) = 2 from public.categories c join public.organizations o on o.id = c.organization_id
    where o.slug = 'gadget-home' and c.parent_id is null),
  'one top-level category per industry');
select pg_temp.assert(
  (select tracking = 'serial' from public.categories c join public.organizations o on o.id = c.organization_id
    where o.slug = 'gadget-home' and c.slug = 'mobile-phones'),
  'phones are tracked by serial number');
select pg_temp.assert(
  (select array_agg(a.key order by a.sort_order) = array['material', 'capacity', 'induction_compatible']
     from public.attribute_definitions a join public.categories c on c.id = a.category_id
    where c.slug = 'cookware' and c.organization_id = (select (r ->> 'organization_id')::uuid from b_multi)),
  'cookware gets material, capacity and induction attributes');
select pg_temp.assert(
  (select is_variant_option and unit = 'L' from public.attribute_definitions a join public.categories c on c.id = a.category_id
    where c.slug = 'cookware' and a.key = 'capacity' and c.organization_id = (select (r ->> 'organization_id')::uuid from b_multi)),
  'capacity is a variant option measured in litres');

-- Products inherit tracking from their category
insert into public.products (organization_id, title, slug, category_id)
select (r ->> 'organization_id')::uuid, 'Phone X', 'phone-x',
       (select id from public.categories where slug = 'mobile-phones'
          and organization_id = (select (r ->> 'organization_id')::uuid from b_multi))
from b_multi;
select pg_temp.assert(
  (select tracking = 'serial' from public.products where slug = 'phone-x'), 'product inherits serial tracking');

-- Adding an industry later seeds it once (idempotent)
select public.add_industries((select (r ->> 'organization_id')::uuid from b_multi), array['grocery']);
select public.add_industries((select (r ->> 'organization_id')::uuid from b_multi), array['grocery']);
select pg_temp.assert(
  (select count(*) = 1 from public.categories where slug = 'grocery' and parent_id is null
     and organization_id = (select (r ->> 'organization_id')::uuid from b_multi)),
  'add_industries is idempotent');
select pg_temp.assert(
  (select tracking = 'batch' from public.categories where slug = 'packaged-food'
     and organization_id = (select (r ->> 'organization_id')::uuid from b_multi)),
  'packaged food is tracked by batch');

-- Default organization gets a General category
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select pg_temp.assert(
  (select count(*) = 2 from public.categories where organization_id = (select (r ->> 'organization_id')::uuid from a_org)),
  'organizations without industries get Other > General');
select pg_temp.assert(
  (select count(*) = 0 from public.categories where slug = 'mobile-phones'),
  'categories of other tenants are invisible');

-- Unknown industries are rejected
do $$
begin
  perform public.create_organization('Bad', 'bad-industry', 'Bad', 'bad', 'INR', 'W', 'W1', 'X', array['weapons']);
  raise exception 'ASSERTION FAILED: unknown industry should be rejected';
exception when check_violation then null;
end $$;

-- Restricted staff cannot edit categories
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
do $$
begin
  update public.categories set name = 'Hacked' where organization_id = (select (r ->> 'organization_id')::uuid from a_org);
  if found then raise exception 'ASSERTION FAILED: staff must not edit categories'; end if;
end $$;

-- Ownership invariant --------------------------------------------------------------------
reset role;
do $$
begin
  delete from public.organization_members where user_id = '00000000-0000-0000-0000-00000000000a';
  raise exception 'ASSERTION FAILED: last owner must not be removable';
exception when check_violation then null;
end $$;

-- Deleting the whole organization still cascades cleanly
delete from public.organizations where slug = 'other-shop';
select pg_temp.assert((select count(*) = 0 from public.shops where slug = 'other'), 'organization delete cascades');

select 'ALL DATABASE TESTS PASSED' as result;
rollback;
