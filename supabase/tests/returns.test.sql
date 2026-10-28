-- =============================================================================
-- Returns, exchanges and credit notes: eligibility, workflow, stock, money, GST.
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

-- Order A: 3 tees and oats (with a 200 discount) and oats, COD with delivery 49; shipped and delivered.
create temp table addr on commit drop as select
  '{"name":"Asha Rao","phone":"+919800000001","line1":"12 MG Road","city":"Pune","state":"Maharashtra","postal_code":"411001"}'::jsonb as a;
create temp table oa on commit drop as select public.create_order((select shop from ids), '{"email":"asha@example.com","full_name":"Asha"}',
  (select a from addr), jsonb_build_array(
    jsonb_build_object('variant_id', (select m from v), 'quantity', 3),
    jsonb_build_object('variant_id', (select oats from v), 'quantity', 1)), 'cod', 'pending', 49, 200) as id;
grant select on oa to authenticated, service_role;
create temp table li on commit drop as select
  (select id from public.order_items where order_id = (select id from oa) and sku = 'TEE-M') as tee,
  (select id from public.order_items where order_id = (select id from oa) and sku = 'OATS') as oats;
grant select on li to authenticated, service_role;

select pg_temp.assert(
  (public.order_return_options((select id from oa)) -> 'items' -> 0 ->> 'blocked') = 'not_delivered',
  'nothing can be returned before delivery');

create temp table sa on commit drop as select public.create_shipment((select id from oa), (select wh from ids),
  jsonb_build_array(jsonb_build_object('order_item_id', (select tee from li), 'quantity', 3),
                    jsonb_build_object('order_item_id', (select oats from li), 'quantity', 1))) as id;
select public.update_shipment_status((select id from sa), 'picked_up');
create temp table otp on commit drop as select public.update_shipment_status((select id from sa), 'out_for_delivery') as code;
select public.confirm_delivery((select id from sa), (select code from otp));
grant select on sa to authenticated, service_role;

select pg_temp.assert((select status = 'completed' and payment_status = 'paid' and invoice_number is not null
                       from public.orders where id = (select id from oa)), 'delivered, paid by cash, invoiced');

-- ---------------------------------------------------------------------------
-- Eligibility
-- ---------------------------------------------------------------------------
create temp table opts on commit drop as select public.order_return_options((select id from oa)) as j;
select pg_temp.assert(
  (select (i ->> 'returnable')::int = 3 and i ->> 'blocked' is null and (i ->> 'unit_paid')::numeric = 450
          and jsonb_array_length(i -> 'exchange_for') = 1 and i -> 'exchange_for' -> 0 ->> 'title' = 'L'
   from opts, jsonb_array_elements(j -> 'items') i where i ->> 'sku' = 'TEE-M'),
  'tees can be returned (paid 450 each after the discount) or swapped for the L in stock');
select pg_temp.assert(
  (select i ->> 'blocked' = 'not_returnable' from opts, jsonb_array_elements(j -> 'items') i where i ->> 'sku' = 'OATS'),
  'food is marked non-returnable');
select pg_temp.assert((select (j ->> 'needs_upi')::boolean and (j ->> 'window_days')::int = 7 from opts),
  'a cash order needs a UPI id for the refund; the window defaults to 7 days');

-- ---------------------------------------------------------------------------
-- Shopper requests
-- ---------------------------------------------------------------------------
select pg_temp.as_server();
create temp table si on commit drop as select public.shopper_sign_in_start((select shop from ids), 'asha@example.com') as j;
create temp table sess on commit drop as
  select public.shopper_sign_in_verify((select (j ->> 'sign_in_id')::uuid from si), (select j ->> 'otp' from si)) ->> 'token' as tok;
create temp table tok on commit drop as select (select public_token from public.orders where id = (select id from oa)) as t;

select pg_temp.assert(
  (public.shopper_order_access((select shop from ids), (select tok from sess), (select t from tok)) ->> 'can_return')::boolean,
  'the order page offers returns');

select pg_temp.expect_error(format($q$select public.shopper_request_return(%L, %L, %L, %L, 'size_fit', null, 'refund', null)$q$,
  (select shop from ids), (select tok from sess), (select t from tok),
  jsonb_build_array(jsonb_build_object('order_item_id', (select tee from li), 'quantity', 1))), '23514',
  'a cash refund needs a UPI id');
select pg_temp.expect_error(format($q$select public.shopper_request_return(%L, %L, %L, %L, 'size_fit', null, 'refund', 'asha@okbank')$q$,
  (select shop from ids), (select tok from sess), (select t from tok),
  jsonb_build_array(jsonb_build_object('order_item_id', (select oats from li), 'quantity', 1))), '23514',
  'non-returnable items are refused');
select pg_temp.expect_error(format($q$select public.shopper_request_return(%L, %L, %L, %L, 'size_fit', null, 'refund', 'asha@okbank')$q$,
  (select shop from ids), (select tok from sess), (select t from tok),
  jsonb_build_array(jsonb_build_object('order_item_id', (select tee from li), 'quantity', 4))), '23514',
  'no more than was delivered');
select pg_temp.expect_error(format($q$select public.shopper_request_return(%L, %L, %L, %L, 'size_fit', null, 'exchange', null)$q$,
  (select shop from ids), (select tok from sess), (select t from tok),
  jsonb_build_array(jsonb_build_object('order_item_id', (select tee from li), 'quantity', 1, 'exchange_variant_id', (select oats from v)))), '23514',
  'exchanges only for another option of the same product');
select pg_temp.expect_error(format($q$select public.shopper_request_return(%L, %L, %L, %L, 'other', '  ', 'refund', 'asha@okbank')$q$,
  (select shop from ids), (select tok from sess), (select t from tok),
  jsonb_build_array(jsonb_build_object('order_item_id', (select tee from li), 'quantity', 1))), '23514',
  '"other" needs an explanation');

-- Withdrawing a request frees the items again.
create temp table r0 on commit drop as select (public.shopper_request_return((select shop from ids), (select tok from sess), (select t from tok),
  jsonb_build_array(jsonb_build_object('order_item_id', (select tee from li), 'quantity', 3)),
  'changed_mind', null, 'refund', 'asha@okbank') ->> 'id')::uuid as id;
select public.shopper_cancel_return((select shop from ids), (select tok from sess), (select id from r0));
select pg_temp.assert((select status = 'cancelled' from public.returns where id = (select id from r0)), 'withdrawn');

-- R1: refund 2 tees (size). R2: exchange 1 tee for L.
create temp table r1 on commit drop as select (public.shopper_request_return((select shop from ids), (select tok from sess), (select t from tok),
  jsonb_build_array(jsonb_build_object('order_item_id', (select tee from li), 'quantity', 2)),
  'size_fit', 'Too small', 'refund', 'asha@okbank') ->> 'id')::uuid as id;
select pg_temp.expect_error(format($q$select public.shopper_request_return(%L, %L, %L, %L, 'size_fit', null, 'refund', 'asha@okbank')$q$,
  (select shop from ids), (select tok from sess), (select t from tok),
  jsonb_build_array(jsonb_build_object('order_item_id', (select tee from li), 'quantity', 2))), '23514',
  'items already in a return are not counted twice');
create temp table r2 on commit drop as select (public.shopper_request_return((select shop from ids), (select tok from sess), (select t from tok),
  jsonb_build_array(jsonb_build_object('order_item_id', (select tee from li), 'quantity', 1, 'exchange_variant_id', (select l from v))),
  'size_fit', null, 'exchange', null) ->> 'id')::uuid as id;
grant select on r1, r2, sess, tok to authenticated, service_role, anon;

select pg_temp.assert((select number = 'RET-000002' and status = 'requested' and refund_upi = 'asha@okbank' from public.returns where id = (select id from r1)),
  'numbered, waiting for review');
select pg_temp.assert(
  (select jsonb_array_length(public.storefront_order((select t from tok)) -> 'returns') = 3),
  'the order page lists the returns');

-- Another shopper can't touch them.
create temp table si2 on commit drop as select public.shopper_sign_in_start((select shop from ids), 'bob@example.com') as j;
create temp table sess2 on commit drop as
  select public.shopper_sign_in_verify((select (j ->> 'sign_in_id')::uuid from si2), (select j ->> 'otp' from si2)) ->> 'token' as tok;
select pg_temp.expect_error(format($q$select public.shopper_cancel_return(%L, %L, %L)$q$,
  (select shop from ids), (select tok from sess2), (select id from r1)), 'P0002', 'other shoppers cannot withdraw it');
select pg_temp.expect_error(format($q$select public.shopper_return_options(%L, %L, %L)$q$,
  (select shop from ids), (select tok from sess2), (select t from tok)), 'P0002', 'or see the options');

select pg_temp.act_as(null);
select pg_temp.expect_error(format($q$select public.shopper_cancel_return(%L, 'x', %L)$q$, (select shop from ids), (select id from r1)),
  '42501', 'the public cannot call shopper functions directly');

-- ---------------------------------------------------------------------------
-- Review and access
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert((select count(*) = 0 from public.returns), 'other tenants see no returns');
select pg_temp.expect_error(format($q$select public.review_return(%L, true)$q$, (select id from r1)), 'P0002',
  'other tenants cannot review');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_error(format($q$select public.review_return(%L, false, '')$q$, (select id from r1)), '23514',
  'declining needs a reason');
select public.review_return((select id from r1), true, 'Pickup tomorrow');
select public.review_return((select id from r2), true);
select pg_temp.expect_error(format($q$select public.review_return(%L, true)$q$, (select id from r1)), '23514',
  'reviewed once');
select public.mark_return_picked_up((select id from r1));

select pg_temp.as_server();
select pg_temp.expect_error(format($q$select public.shopper_cancel_return(%L, %L, %L)$q$,
  (select shop from ids), (select tok from sess), (select id from r1)), '23514', 'too late to withdraw once picked up');

-- ---------------------------------------------------------------------------
-- Receipt: stock, credit note, refund due
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
create temp table before on commit drop as
  select (select on_hand from public.inventory_levels where variant_id = (select m from v) and warehouse_id = (select wh from ids)) as m;
grant select on before to authenticated;
-- One of the two came back damaged.
select public.receive_return((select id from r1), jsonb_build_array(
  jsonb_build_object('return_item_id', (select id from public.return_items where return_id = (select id from r1)), 'restock', true)));
select pg_temp.assert(
  (select on_hand = (select m from before) + 2 from public.inventory_levels
   where variant_id = (select m from v) and warehouse_id = (select wh from ids)),
  'restocked into the warehouse it shipped from');
select pg_temp.assert(exists (select 1 from public.stock_movements where type = 'return' and reference_id = (select id from r1)),
  'stock movement recorded as a return');

-- 3 tees at 500 with 150 discount spread: each 450 paid; GST 5% inclusive.
select pg_temp.assert(
  (select status = 'received' and credit_total = 900 and shipping_credit = 0 and refund_amount = 900 and refund_status = 'due'
          and credit_note_number = 'CN' || (select y from fy) || '-00001'
   from public.returns where id = (select id from r1)),
  'two tees credited at what was paid, delivery kept (size issue, not everything back), credit note issued');
select pg_temp.assert(
  (select (ri.total = 1000 and ri.discount_amount = 100 and ri.tax_amount = round(oi.tax_amount * 2 / 3, 2))
   from public.return_items ri join public.order_items oi on oi.id = ri.order_item_id where ri.return_id = (select id from r1)),
  'line share frozen: value, discount and GST');
create temp table cn on commit drop as select public.return_credit_note((select id from r1)) as j;
select pg_temp.assert(
  (select j ->> 'kind' = 'credit_note' and (j ->> 'grand_total')::numeric = 900
          and j -> 'against' ->> 'number' = (select invoice_number from public.orders where id = (select id from oa))
          and j -> 'seller' ->> 'gstin' = '29ABCDE1234F1Z5' and (j -> 'items' -> 0 ->> 'quantity')::int = 2
          and (j -> 'items' -> 0 ->> 'hsn_code') = '6109'
   from cn),
  'the credit note references the invoice and has the invoice''s shape');

-- Cash order: no online payment, so staff can't start a provider refund; staff (not manager) can't record one.
select pg_temp.expect_error(format($q$select public.record_manual_refund(%L, 'upi', 'UTR123')$q$, (select id from r1)), '42501',
  'staff cannot record refunds');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error(format($q$select public.start_return_refund(%L)$q$, (select id from r1)), '23514',
  'no online payment to refund to');
select pg_temp.expect_error(format($q$select public.record_manual_refund(%L, 'upi', ' ')$q$, (select id from r1)), '23514',
  'a UPI refund needs its reference');
select public.record_manual_refund((select id from r1), 'upi', 'UTR123456');
select pg_temp.assert(
  (select r.status = 'completed' and r.refund_status = 'refunded' and r.refunded_amount = 900 and o.payment_status = 'partially_refunded'
   from public.returns r join public.orders o on o.id = r.order_id where r.id = (select id from r1)),
  'refund recorded; the order is partly refunded');

-- ---------------------------------------------------------------------------
-- Exchange
-- ---------------------------------------------------------------------------
select public.receive_return((select id from r2));
select pg_temp.assert(
  (select status = 'received' and refund_status is null and refund_amount = 0 and credit_total = 450
          and credit_note_number = 'CN' || (select y from fy) || '-00002'
   from public.returns where id = (select id from r2)),
  'an exchange is credited (last unit takes the remainder) but nothing is refunded');
create temp table ex on commit drop as select public.create_exchange_order((select id from r2)) as id;
select pg_temp.assert(
  (select o.source = 'exchange' and o.status = 'confirmed' and o.payment_method = 'store_credit' and o.payment_status = 'paid'
          and o.grand_total = 450 and o.shipping_total = 0 and oi.variant_id = (select l from v) and oi.unit_price = 500
   from public.orders o join public.order_items oi on oi.order_id = o.id where o.id = (select id from ex)),
  'replacement order for the L at the price paid, nothing to pay, stock reserved');
select pg_temp.assert((select status = 'completed' and exchange_order_id = (select id from ex) from public.returns where id = (select id from r2)),
  'exchange complete');
select pg_temp.assert(
  (select fulfillment_status = 'returned' from public.orders where id = (select id from oa)) is false,
  'oats were kept, so the order is not fully returned');

-- Staff can take back what shoppers can't (food, batch-tracked): back into its batch.
create temp table bt on commit drop as
  select on_hand from public.inventory_batches where variant_id = (select oats from v) and batch_code = 'B1';
grant select on bt to authenticated;
create temp table r3 on commit drop as select public.create_return((select id from oa),
  jsonb_build_array(jsonb_build_object('order_item_id', (select oats from li), 'quantity', 1)), 'damaged', 'Seal broken') as id;
grant select on r3 to authenticated, service_role;
select pg_temp.assert((select status = 'approved' and source = 'staff' from public.returns where id = (select id from r3)),
  'staff returns start approved');
select public.receive_return((select id from r3));
select pg_temp.assert(
  (select on_hand = (select on_hand from bt) + 1 from public.inventory_batches where variant_id = (select oats from v) and batch_code = 'B1'),
  'back into the batch it shipped from');
select pg_temp.assert(
  (select credit_total = 450 + 49 and shipping_credit = 49 and refund_amount = 499 and refund_status = 'due'
   from public.returns where id = (select id from r3)),
  'everything is back and the shop was at fault: delivery is credited too');
select pg_temp.assert((public.return_credit_note((select id from r3)) ->> 'shipping_rate')::numeric = 12,
  'delivery is credited at the rate it was invoiced at (the order''s highest item rate)');
select pg_temp.assert((select fulfillment_status = 'returned' from public.orders where id = (select id from oa)),
  'the whole order is now returned');

-- ---------------------------------------------------------------------------
-- Prepaid order returned to origin: automatic credit note and refund due
-- ---------------------------------------------------------------------------
create temp table ob on commit drop as select public.create_order((select shop from ids), '{"email":"ravi@example.com"}',
  (select a from addr), jsonb_build_array(jsonb_build_object('variant_id', (select m from v), 'quantity', 2)), 'upi', 'paid', 49) as id;
grant select on ob to authenticated, service_role;
reset role;
insert into public.payments (organization_id, order_id, provider_order_id, provider_payment_id, amount, currency, status, captured_at)
values ((select org from ids), (select id from ob), 'order_RB', 'pay_RB', 1049, 'INR', 'captured', now());
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
create temp table sb on commit drop as select public.create_shipment((select id from ob), (select wh from ids),
  jsonb_build_array(jsonb_build_object('order_item_id', (select id from public.order_items where order_id = (select id from ob)), 'quantity', 2))) as id;
select public.update_shipment_status((select id from sb), 'picked_up');
select public.update_shipment_status((select id from sb), 'returned_to_origin');
create temp table rb on commit drop as select id from public.returns where order_id = (select id from ob);
grant select on rb to authenticated, service_role;
select pg_temp.assert(
  (select source = 'rto' and status = 'received' and credit_total = 1049 and shipping_credit = 49 and refund_amount = 1049
          and refund_status = 'due' and credit_note_number is not null
   from public.returns where id = (select id from rb)),
  'undelivered prepaid parcel: full credit note including delivery, full refund due');

create temp table plan on commit drop as select public.start_return_refund((select id from rb)) as j;
select pg_temp.assert(
  (select jsonb_array_length(j -> 'payments') = 1 and (j -> 'payments' -> 0 ->> 'amount')::numeric = 1049
          and j -> 'payments' -> 0 ->> 'provider_payment_id' = 'pay_RB' from plan),
  'refund plan: the captured payment');
select pg_temp.expect_error(format($q$select public.start_return_refund(%L)$q$, (select id from rb)), '23514',
  'a refund in progress cannot be started twice');

select pg_temp.as_server();
select public.record_return_refund((select id from rb), (select id from public.payments where provider_payment_id = 'pay_RB'), 'rfnd_1', 1049);
select public.record_return_refund((select id from rb), (select id from public.payments where provider_payment_id = 'pay_RB'), 'rfnd_1', 1049);
select pg_temp.assert(
  (select r.status = 'completed' and r.refund_status = 'refunded' and r.refunded_amount = 1049
          and p.status = 'refunded' and o.payment_status = 'refunded' and o.fulfillment_status = 'returned'
          and (select count(*) from public.return_refunds where return_id = r.id) = 1
   from public.returns r join public.orders o on o.id = r.order_id join public.payments p on p.order_id = o.id
   where r.id = (select id from rb)),
  'refund recorded once; payment and order refunded; order returned');

-- Cash order returned to origin: credit note, nothing to refund.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
create temp table oc on commit drop as select public.create_order((select shop from ids), '{"email":"kiran@example.com"}',
  (select a from addr), jsonb_build_array(jsonb_build_object('variant_id', (select m from v), 'quantity', 1)), 'cod') as id;
create temp table sc on commit drop as select public.create_shipment((select id from oc), (select wh from ids),
  jsonb_build_array(jsonb_build_object('order_item_id', (select id from public.order_items where order_id = (select id from oc)), 'quantity', 1))) as id;
select public.update_shipment_status((select id from sc), 'picked_up');
select public.update_shipment_status((select id from sc), 'returned_to_origin');
select pg_temp.assert(
  (select r.status = 'completed' and r.refund_status = 'not_needed' and r.credit_total = 500 and r.credit_note_number is not null
   from public.returns r where r.order_id = (select id from oc)),
  'undelivered cash order: credit note only');

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create temp table gst on commit drop as select public.gst_credit_notes((select org from ids), current_date) as j;
select pg_temp.assert((select jsonb_array_length(j) = 5 from gst), 'all credit notes of the month');
select pg_temp.assert(
  (select (j ->> 'received')::int = 5 and (j ->> 'credited')::numeric = 900 + 450 + 499 + 1049 + 500 and (j ->> 'undelivered')::int = 2
   from (select public.returns_report((select org from ids), current_date - 1, current_date) as j) x),
  'returns report');
select pg_temp.assert((select count(*) = 6 from public.return_overview), 'overview lists them (withdrawn one included)');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_error(format($q$select public.gst_credit_notes(%L, current_date)$q$, (select org from ids)), '42501',
  'staff cannot read tax reports');

-- Direct writes are blocked.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error(format($q$update public.returns set refund_amount = 99999 where id = %L$q$, (select id from r1)), '42501',
  'returns change only through the functions');

\echo ALL RETURNS TESTS PASSED
rollback;
