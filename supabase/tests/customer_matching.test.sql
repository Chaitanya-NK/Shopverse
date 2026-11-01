-- =============================================================================
-- Which customer an order belongs to (create_order_core).
-- Runs in a transaction and rolls back.
-- =============================================================================
begin;

create function pg_temp.assert(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'ASSERTION FAILED: %', p_msg; end if;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@retail.test', '{"full_name":"Owner"}');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
set local role authenticated;

create temp table o on commit drop as
  select (public.create_organization('Match Retail', 'match-retail', 'Match Store', 'match-store', 'INR',
          'Bengaluru WH', 'BLR', 'Bengaluru', array['fashion']) ->> 'organization_id')::uuid as org;
create temp table ids on commit drop as select
  (select org from o) as org,
  (select id from public.shops where organization_id = (select org from o)) as shop;
select public.create_product((select org from ids),
  jsonb_build_object('title', 'Tee', 'slug', 'tee', 'status', 'active',
    'category_id', (select id from public.categories where slug = 'clothing' and organization_id = (select org from ids))),
  '[{"sku":"M-TEE","price":499}]', array[(select shop from ids)]);

create function pg_temp.order_for(p_email text, p_phone text) returns uuid language plpgsql as $$
declare v_order uuid;
begin
  v_order := public.create_order(
    (select shop from ids),
    jsonb_build_object('email', p_email, 'phone', p_phone, 'full_name', 'Asha'),
    jsonb_build_object('name', 'Asha', 'phone', coalesce(p_phone, '9800000001'), 'line1', '12 MG Road',
      'city', 'Pune', 'state', 'Maharashtra', 'postal_code', '411001'),
    jsonb_build_array(jsonb_build_object('variant_id',
      (select id from public.product_variants where sku = 'M-TEE'), 'quantity', 1)),
    'cod', 'pending', 0, 0, null, false);
  return (select customer_id from public.orders where id = v_order);
end $$;

-- One statement per order, so each sees the customers the previous ones made.
create temp table r (name text primary key, customer uuid) on commit drop;
insert into r values ('first', pg_temp.order_for('asha@one.test', '+919800000001'));
insert into r values ('same_email', pg_temp.order_for('asha@one.test', null));
insert into r values ('other_email_same_phone', pg_temp.order_for('ravi@two.test', '+919800000001'));
insert into r values ('phone_only', pg_temp.order_for(null, '+919800000001'));
insert into r values ('new_phone', pg_temp.order_for(null, '+919811111111'));
insert into r values ('adopts_phone_record', pg_temp.order_for('neha@three.test', '+919811111111'));
create temp view c as select
  max(customer::text) filter (where name = 'first')::uuid as first,
  max(customer::text) filter (where name = 'same_email')::uuid as same_email,
  max(customer::text) filter (where name = 'other_email_same_phone')::uuid as other_email_same_phone,
  max(customer::text) filter (where name = 'phone_only')::uuid as phone_only,
  max(customer::text) filter (where name = 'new_phone')::uuid as new_phone,
  max(customer::text) filter (where name = 'adopts_phone_record')::uuid as adopts_phone_record
from r;

select pg_temp.assert((select first = same_email from c), 'same email, same customer');
select pg_temp.assert((select first <> other_email_same_phone from c),
  'a different email never joins another customer through the phone');
select pg_temp.assert((select email::text from public.customers where id = (select other_email_same_phone from c)) = 'ravi@two.test',
  'the new email gets its own customer');
select pg_temp.assert((select phone from public.customers where id = (select other_email_same_phone from c)) is null,
  'the phone stays with its owner');
select pg_temp.assert((select first = phone_only from c), 'orders without an email match on phone');
select pg_temp.assert((select new_phone = adopts_phone_record from c), 'an email adopts a phone-only customer');
select pg_temp.assert((select email::text from public.customers where id = (select new_phone from c)) = 'neha@three.test',
  'and the email is added to it');

do $$ begin raise notice 'ALL CUSTOMER MATCHING TESTS PASSED'; end $$;
rollback;
