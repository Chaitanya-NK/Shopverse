-- =============================================================================
-- Brand and reach: branding, custom domains, messaging, abandoned carts.
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
  ('00000000-0000-0000-0000-0000000000a2', 'staff@retail.test', '{"full_name":"Staff"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'other@else.test', '{"full_name":"Other"}');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
create temp table o on commit drop as
  select (public.create_organization('Mega Retail', 'mega-retail', 'Mega Store', 'mega-store', 'INR',
          'Bengaluru WH', 'BLR', 'Bengaluru', array['fashion', 'electronics', 'grocery']) ->> 'organization_id')::uuid as org;
create temp table ids on commit drop as select
  (select org from o) as org,
  (select id from public.warehouses where organization_id = (select org from o)) as wh,
  (select id from public.shops where organization_id = (select org from o)) as shop;
reset role;
insert into public.organization_members (organization_id, user_id, role)
values ((select org from ids), '00000000-0000-0000-0000-0000000000a2', 'staff');
create temp table fy on commit drop as select private.financial_year(now()) as y;
grant select on fy to authenticated, service_role;
update public.shops set order_prefix = 'MEGA', status = 'live',
  settings = '{"legal_name":"Mega Retail Pvt Ltd","gstin":"29ABCDE1234F1Z5","business_address":{"line1":"1 Residency Rd","city":"Bengaluru","state":"Karnataka","postal_code":"560025"}}'
where id = (select shop from ids);
update public.categories set gst_rate = 5, hsn_code = '6109' where slug = 'clothing' and organization_id = (select org from ids);
update public.categories set gst_rate = 12, returnable = false where slug = 'packaged-food' and organization_id = (select org from ids);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');

select public.create_product((select org from ids),
  jsonb_build_object('title', 'Tee', 'slug', 'tee', 'status', 'active',
    'category_id', (select id from public.categories where slug = 'clothing' and organization_id = (select org from ids))),
  '[{"sku":"TEE-M","price":500,"title":"M","options":{"size":"M"}},{"sku":"TEE-L","price":500,"title":"L","options":{"size":"L"}}]', array[(select shop from ids)]);
select public.create_product((select org from ids),
  jsonb_build_object('title', 'Oats', 'slug', 'oats', 'status', 'active', 'attributes', '{"diet":"Vegan"}'::jsonb,
    'category_id', (select id from public.categories where slug = 'packaged-food' and organization_id = (select org from ids))),
  '[{"sku":"OATS","price":500}]', array[(select shop from ids)]);
create temp table v on commit drop as select
  (select id from public.product_variants where sku = 'TEE-M') as m,
  (select id from public.product_variants where sku = 'TEE-L') as l,
  (select id from public.product_variants where sku = 'OATS') as oats;
reset role;
update public.products set tracking = 'quantity' where slug = 'tee';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select public.receive_stock((select m from v), (select wh from ids), 10);
select public.receive_stock((select l from v), (select wh from ids), 10);
select public.receive_stock((select oats from v), (select wh from ids), 10, null, 'B1', current_date + 60);
grant select on ids, v to authenticated, service_role, anon;

reset role;
create temp table addr on commit drop as select
  '{"name":"Asha Rao","phone":"+919800000001","line1":"12 MG Road","city":"Pune","state":"Maharashtra","postal_code":"411001"}'::jsonb as a;
create temp table cart on commit drop as select
  jsonb_build_array(jsonb_build_object('variant_id', (select m from v), 'quantity', 2)) as two;
grant select on addr, cart to service_role, authenticated, anon;

-- ---------------------------------------------------------------------------
-- Brand
-- ---------------------------------------------------------------------------
create temp table pfx on commit drop as
  select (select org from ids)::text || '/shops/' || (select shop from ids)::text || '/' as p;
grant select on pfx to authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_error(format($q$select public.save_shop_branding(%L, '{"color":"#112233"}')$q$, (select shop from ids)),
  '42501', 'staff cannot change the brand');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error(format($q$select public.save_shop_branding(%L, '{"color":"red"}')$q$, (select shop from ids)),
  '23514', 'colours are hex');
select pg_temp.expect_error(format($q$select public.save_shop_branding(%L, '{"color":"#112233","logo":{"path":"other-org/x"}}')$q$,
  (select shop from ids)), '23514', 'logos must be this shop''s uploads');
select pg_temp.expect_error(format($q$select public.save_shop_branding(%L, %L)$q$, (select shop from ids),
  jsonb_build_object('color', '#112233', 'banners', jsonb_build_array(jsonb_build_object('path', (select p from pfx) || 'b1', 'link', 'javascript:alert(1)')))),
  '23514', 'banner links are relative or https');
select public.save_shop_branding((select shop from ids), jsonb_build_object(
  'color', '#1D6B5C',
  'logo', jsonb_build_object('path', (select p from pfx) || 'logo', 'width', 200, 'height', 80),
  'banners', jsonb_build_array(jsonb_build_object('id', 'b1', 'path', (select p from pfx) || 'b1', 'headline', 'Diwali sale', 'link', '/s/mega-store/c/diwali'))));
reset role;
select pg_temp.assert(
  (select settings -> 'branding' ->> 'color' = '#1d6b5c' and jsonb_array_length(settings -> 'branding' -> 'banners') = 1
     and settings ->> 'legal_name' = 'Mega Retail Pvt Ltd'
   from public.shops where id = (select shop from ids)), 'brand saved, other settings kept');
select pg_temp.act_as(null);
select pg_temp.assert((public.storefront_shop('mega-store') -> 'branding' ->> 'color') = '#1d6b5c', 'shoppers see the brand');

-- ---------------------------------------------------------------------------
-- Custom domains
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error(format($q$select public.set_shop_domain(%L, 'not a domain')$q$, (select shop from ids)), '23514', 'hostnames only');
select pg_temp.expect_error(format($q$select public.set_shop_domain(%L, 'https://shop.example.com/x')$q$, (select shop from ids)), '23514', 'no URLs');
create temp table tok on commit drop as select public.set_shop_domain((select shop from ids), ' Shop.Example.COM. ') as t;
grant select on tok to authenticated, service_role, anon;
select pg_temp.assert((select t like 'shopverse-verify=%' from tok), 'a TXT value to add');
select pg_temp.assert(public.set_shop_domain((select shop from ids), 'shop.example.com') = (select t from tok), 'same domain keeps its token');
select pg_temp.act_as(null);
select pg_temp.assert(public.shop_for_domain('shop.example.com') is null, 'not served before verification');
select pg_temp.expect_error(format($q$select public.mark_shop_domain_verified(%L, 'shop.example.com')$q$, (select shop from ids)), '42501',
  'only the server verifies');
select pg_temp.as_server();
select pg_temp.assert(not public.mark_shop_domain_verified((select shop from ids), 'other.example.com'), 'must match the claimed domain');
select pg_temp.assert(public.mark_shop_domain_verified((select shop from ids), 'shop.example.com'), 'verified');
select pg_temp.act_as(null);
select pg_temp.assert(public.shop_for_domain('SHOP.example.com:443') = 'mega-store', 'served, any case, port ignored');
select pg_temp.assert(public.storefront_shop('mega-store') ->> 'domain' = 'shop.example.com', 'storefront knows its domain');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select public.set_shop_domain((select shop from ids), 'www.example.com');
select pg_temp.act_as(null);
select pg_temp.assert(public.shop_for_domain('www.example.com') is null and public.shop_for_domain('shop.example.com') is null,
  'changing the domain needs verifying again');

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_error(format($q$select public.save_messaging_settings(%L, 'test', 'whatsapp', array['confirmed'], true)$q$,
  (select org from ids)), '42501', 'staff cannot set up messaging');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error(format($q$select public.save_messaging_settings(%L, 'twilio', 'sms', array['confirmed'], true)$q$,
  (select org from ids)), '23514', 'twilio needs its keys');
select pg_temp.expect_error(format($q$select public.save_messaging_settings(%L, 'test', 'sms', array['spam'], true)$q$,
  (select org from ids)), '23514', 'known events only');
select public.save_messaging_settings((select org from ids), 'twilio', 'whatsapp', array['confirmed', 'shipped'], true,
  'AC' || repeat('a', 32), 'v1:enc', '+14155238886');
select public.save_messaging_settings((select org from ids), 'twilio', 'whatsapp', array['confirmed', 'shipped'], true,
  'AC' || repeat('a', 32), null, '+14155238886');
select pg_temp.assert(
  (select s ->> 'provider' = 'twilio' and (s ->> 'token_saved')::boolean and not s ? 'auth_token_enc'
   from (select public.get_messaging_settings((select org from ids)) s) x), 'token kept, never shown');
select pg_temp.act_as(null);
select pg_temp.assert(public.storefront_shop('mega-store') ->> 'message_channel' = 'whatsapp', 'checkout offers WhatsApp');
select pg_temp.as_server();
select pg_temp.assert(public.messaging_account((select org from ids)) ->> 'auth_token_enc' = 'v1:enc', 'the server reads the token');

-- A guest who opts in at checkout gets updates on that order.
create temp table c1 on commit drop as select public.storefront_checkout_start((select shop from ids),
  (select two from cart), '{"name":"Asha Rao","email":"asha@example.com","phone":"+919800000001","message_opt_in":true}', (select a from addr)) as j;
grant select on c1 to service_role, authenticated;
reset role;
select pg_temp.assert(
  (select status = 'open' and source = 'checkout' and subtotal = 1000 and name = 'Asha Rao' from public.cart_recoveries
   where email = 'asha@example.com'), 'an unfinished checkout is a cart to recover');
select pg_temp.as_server();
create temp table r1 on commit drop as
  select public.storefront_checkout_confirm((select (j ->> 'checkout_id')::uuid from c1), (select j ->> 'otp' from c1)) as j;
grant select on r1 to service_role, authenticated;
reset role;
select pg_temp.assert((select message_opt_in from public.orders where id = (select (j ->> 'order_id')::uuid from r1)), 'opt-in carried to the order');
select pg_temp.assert(
  (select status = 'closed' and recovered_order_id is null from public.cart_recoveries where email = 'asha@example.com'),
  'ordering without a reminder just closes the cart');
select pg_temp.as_server();
select public.record_message((select org from ids), (select (j ->> 'order_id')::uuid from r1), 'whatsapp', 'twilio', 'confirmed',
  '+919800000001', 'Your order is confirmed', 'sent', 'SM123');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert((select count(*) from public.message_log) = 1, 'owners see the message log');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.assert((select count(*) from public.message_log) = 0, 'staff do not');

-- ---------------------------------------------------------------------------
-- Abandoned carts
-- ---------------------------------------------------------------------------
select pg_temp.as_server();
create temp table c2 on commit drop as select public.storefront_checkout_start((select shop from ids),
  (select two from cart), '{"name":"Bob","email":"bob@example.com","phone":"+919800000002"}', (select a from addr)) as j;
-- A second try updates the same cart.
create temp table c3 on commit drop as select public.storefront_checkout_start((select shop from ids),
  jsonb_build_array(jsonb_build_object('variant_id', (select l from v), 'quantity', 1)),
  '{"name":"Bob","email":"BOB@example.com","phone":"+919800000002"}', (select a from addr)) as j;
reset role;
select pg_temp.assert((select count(*) = 1 and max(subtotal) = 500 from public.cart_recoveries where email = 'bob@example.com' and status = 'open'),
  'one open cart per shopper, latest contents');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.assert((select count(*) from public.cart_recoveries) = 0, 'staff do not see carts');
select pg_temp.expect_error($q$select token from public.cart_recoveries$q$, '42501', 'nobody reads restore tokens');

-- Reminders off: nothing goes out. On, with a code: after the delay.
select pg_temp.as_server();
select pg_temp.assert(jsonb_array_length(public.claim_cart_reminders(now() + interval '5 hours')) = 0, 'off by default');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error(format($q$select public.save_cart_reminder_settings(%L, true, 2, null)$q$, (select shop from ids)), '23514', 'set delays');
select pg_temp.expect_error(format($q$select public.save_cart_reminder_settings(%L, true, 3, 'NOPE')$q$, (select shop from ids)), '23514',
  'codes must exist');
reset role;
insert into public.discounts (organization_id, code, title, kind, value) values ((select org from ids), 'COMEBACK10', 'Come back 10%', 'percent', 10);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select public.save_cart_reminder_settings((select shop from ids), true, 3, 'comeback10');
select pg_temp.as_server();
select pg_temp.assert(jsonb_array_length(public.claim_cart_reminders(now() + interval '1 hour')) = 0, 'not before the delay');
create temp table due on commit drop as select public.claim_cart_reminders(now() + interval '4 hours') as j;
grant select on due to service_role, authenticated;
select pg_temp.assert(
  (select jsonb_array_length(j) = 1 and j -> 0 ->> 'email' = 'bob@example.com' and j -> 0 ->> 'discount_code' = 'COMEBACK10'
     and j -> 0 -> 'items' -> 0 ->> 'title' = 'Tee · L' and j -> 0 -> 'shop' ->> 'slug' = 'mega-store' from due),
  'one reminder with the code and the items');
select pg_temp.assert(jsonb_array_length(public.claim_cart_reminders(now() + interval '5 hours')) = 0, 'claimed once');
select pg_temp.assert(
  (select r -> 'lines' -> 0 ->> 'quantity' = '1' and r ->> 'shop_slug' = 'mega-store' and r ->> 'discount_code' = 'COMEBACK10'
   from (select public.cart_recovery_restore((select j -> 0 ->> 'token' from due)) r) x), 'restore link refills the cart');
select pg_temp.assert(public.cart_recovery_restore('nope') is null, 'bad tokens restore nothing');

-- Bob orders: the reminder worked.
create temp table c4 on commit drop as select public.storefront_checkout_start((select shop from ids),
  jsonb_build_array(jsonb_build_object('variant_id', (select l from v), 'quantity', 1)),
  '{"name":"Bob","email":"bob@example.com","phone":"+919800000002"}', (select a from addr), 'cod', 'COMEBACK10') as j;
select public.storefront_checkout_confirm((select (j ->> 'checkout_id')::uuid from c4), (select j ->> 'otp' from c4));
reset role;
select pg_temp.assert(
  (select r.status = 'recovered' and o.grand_total > 0 and r.clicked_at is not null
   from public.cart_recoveries r join public.orders o on o.id = r.recovered_order_id
   where r.email = 'bob@example.com' and r.reminded_at is not null), 'recovered, linked to the order');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert(
  (select (s ->> 'reminded')::int = 1 and (s ->> 'recovered')::int = 1 and (s ->> 'recovered_total')::numeric > 0
   from (select public.cart_recovery_stats((select org from ids)) s) x), 'stats');

-- Opting out stops reminders for that shop.
select pg_temp.as_server();
create temp table c5 on commit drop as select public.storefront_checkout_start((select shop from ids),
  (select two from cart), '{"name":"Cy","email":"cy@example.com","phone":"+919800000003"}', (select a from addr)) as j;
select pg_temp.assert(public.cart_reminder_optout((select token from public.cart_recoveries where email = 'cy@example.com')) = 'Mega Store',
  'opt-out names the shop');
select pg_temp.assert(
  (select count(*) from jsonb_array_elements(public.claim_cart_reminders(now() + interval '4 hours')) x where x ->> 'email' = 'cy@example.com') = 0,
  'no reminder after opting out');

-- Signed-in shoppers' carts are tracked too.
create temp table si on commit drop as select public.shopper_sign_in_start((select shop from ids), 'dee@example.com') as j;
create temp table sess on commit drop as
  select public.shopper_sign_in_verify((select (j ->> 'sign_in_id')::uuid from si), (select j ->> 'otp' from si)) ->> 'token' as tok;
select public.shopper_track_cart((select shop from ids), (select tok from sess), (select two from cart));
reset role;
select pg_temp.assert((select source = 'account' and subtotal = 1000 from public.cart_recoveries where email = 'dee@example.com' and status = 'open'),
  'account cart tracked and priced from the database');
select pg_temp.as_server();
select public.shopper_track_cart((select shop from ids), (select tok from sess), '[]');
select public.shopper_track_cart((select shop from ids), 'not-a-token', (select two from cart));
reset role;
select pg_temp.assert((select status = 'closed' from public.cart_recoveries where email = 'dee@example.com'), 'emptying the cart closes it');

\echo ALL BRAND & REACH TESTS PASSED
rollback;
