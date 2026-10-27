-- =============================================================================
-- Shopverse · Migration 010 · Order lifecycle, routing, shipments, delivery OTP
--
--   create_order ──► confirm (route + reserve) ──► create_shipment (pick, consume)
--        │                                              │
--        └──► cancel (release)          packed ─► picked_up ─► in_transit ─► out_for_delivery
--                                          │                                   │   ▲
--                                       cancelled (restock)        failed_attempt ┘   │
--                                                                  confirm_delivery(OTP) ─► delivered
--                                       returned_to_origin (restock) from any in-flight state
--
-- Every write goes through a SECURITY DEFINER function so totals, reservations
-- and stock stay consistent; clients can read but not write these tables.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Columns
-- -----------------------------------------------------------------------------
alter table public.orders
  add column confirmed_at  timestamptz,
  add column completed_at  timestamptz,
  add column cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 500),
  add column paid_at       timestamptz;

alter table public.order_items
  add column tracking           public.inventory_tracking not null default 'quantity',
  add column gst_rate           numeric(5, 2) not null default 0 check (gst_rate between 0 and 100),
  -- Prices are GST-inclusive (as on Indian MRP); this is the tax inside the line total.
  add column tax_amount         numeric(12, 2) not null default 0 check (tax_amount >= 0),
  add column fulfilled_quantity integer not null default 0 check (fulfilled_quantity >= 0),
  add constraint order_items_fulfilled_le_quantity check (fulfilled_quantity <= quantity),
  add constraint order_items_org_id_key unique (organization_id, id);

alter table public.shipments
  add column number          text,
  -- Unguessable token for the customer's public tracking page.
  add column tracking_token  text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  add column otp_expires_at  timestamptz,
  add column otp_attempts    integer not null default 0 check (otp_attempts >= 0),
  add column delivery_attempts integer not null default 0 check (delivery_attempts >= 0),
  add column cancelled_at    timestamptz,
  add column returned_at     timestamptz;

create unique index shipments_tracking_token_uidx on public.shipments (tracking_token);
create unique index shipments_org_number_uidx on public.shipments (organization_id, number);

-- -----------------------------------------------------------------------------
-- Allocations: which warehouse reserves how much of each order line
-- -----------------------------------------------------------------------------
create table public.order_allocations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  order_id         uuid not null,
  order_item_id    uuid not null,
  variant_id       uuid not null,
  warehouse_id     uuid not null,
  -- 0 once released (cancelled order) but kept while shipment history refers to it.
  quantity         integer not null check (quantity >= 0),
  shipped_quantity integer not null default 0 check (shipped_quantity >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint order_allocations_shipped_le_quantity check (shipped_quantity <= quantity),
  unique (order_item_id, warehouse_id),
  unique (organization_id, id),
  foreign key (organization_id, order_id) references public.orders (organization_id, id) on delete cascade,
  foreign key (organization_id, order_item_id) references public.order_items (organization_id, id) on delete cascade,
  foreign key (organization_id, variant_id) references public.product_variants (organization_id, id) on delete restrict,
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id) on delete restrict
);

create index order_allocations_order_idx on public.order_allocations (order_id);
create index order_allocations_stock_idx on public.order_allocations (variant_id, warehouse_id);

create trigger order_allocations_set_updated_at
  before update on public.order_allocations
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Shipment contents (with the exact serials / batches that left the building)
-- -----------------------------------------------------------------------------
create table public.shipment_items (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  shipment_id      uuid not null,
  order_item_id    uuid not null,
  allocation_id    uuid not null,
  quantity         integer not null check (quantity > 0),
  serial_numbers   text[] not null default '{}',
  -- [{ "batch_id": uuid, "batch_code": text, "quantity": int }]
  batches          jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  unique (shipment_id, order_item_id),
  foreign key (organization_id, shipment_id) references public.shipments (organization_id, id) on delete cascade,
  foreign key (organization_id, order_item_id) references public.order_items (organization_id, id) on delete cascade,
  foreign key (organization_id, allocation_id) references public.order_allocations (organization_id, id) on delete restrict
);

create index shipment_items_shipment_idx on public.shipment_items (shipment_id);

-- -----------------------------------------------------------------------------
-- Order timeline
-- -----------------------------------------------------------------------------
create table public.order_events (
  id               bigint generated always as identity primary key,
  organization_id  uuid not null,
  order_id         uuid not null,
  type             text not null check (type ~ '^[a-z_.]{2,40}$'),
  message          text not null check (char_length(message) <= 500),
  metadata         jsonb not null default '{}'::jsonb,
  actor_id         uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, order_id) references public.orders (organization_id, id) on delete cascade
);

create index order_events_order_idx on public.order_events (order_id, created_at desc);

create or replace function private.add_order_event(
  p_organization_id uuid,
  p_order_id uuid,
  p_type text,
  p_message text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.order_events (organization_id, order_id, type, message, metadata, actor_id)
  values (p_organization_id, p_order_id, p_type, p_message, coalesce(p_metadata, '{}'::jsonb), auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- Reservations
-- -----------------------------------------------------------------------------
create or replace function private.reserve_stock(
  p_organization_id uuid, p_variant_id uuid, p_warehouse_id uuid, p_quantity integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level public.inventory_levels;
begin
  insert into public.inventory_levels (organization_id, variant_id, warehouse_id)
  values (p_organization_id, p_variant_id, p_warehouse_id)
  on conflict (variant_id, warehouse_id) do nothing;

  select * into v_level from public.inventory_levels
  where variant_id = p_variant_id and warehouse_id = p_warehouse_id
  for update;

  if v_level.available < p_quantity then
    raise exception 'Not enough stock to reserve: % available, % needed', v_level.available, p_quantity
      using errcode = 'check_violation';
  end if;

  update public.inventory_levels
  set reserved = reserved + p_quantity, updated_at = now()
  where variant_id = p_variant_id and warehouse_id = p_warehouse_id;
end;
$$;

create or replace function private.release_stock(p_variant_id uuid, p_warehouse_id uuid, p_quantity integer)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.inventory_levels
  set reserved = greatest(reserved - p_quantity, 0), updated_at = now()
  where variant_id = p_variant_id and warehouse_id = p_warehouse_id;
$$;

-- -----------------------------------------------------------------------------
-- Authorization helper: the caller may work on this order (role + shop access)
-- -----------------------------------------------------------------------------
create or replace function private.authorize_order(p_order_id uuid, p_roles public.org_role[])
returns public.orders
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null or not private.can_access_shop(v_order.organization_id, v_order.shop_id) then
    raise exception 'Order not found' using errcode = 'no_data_found';
  end if;
  if not private.has_org_role(v_order.organization_id, p_roles) then
    raise exception 'Not allowed to manage this order' using errcode = '42501';
  end if;
  return v_order;
end;
$$;

-- -----------------------------------------------------------------------------
-- Routing: reserve every line in the shop's warehouses.
-- Prefers ONE warehouse that can ship the whole order (fewer parcels); falls
-- back to splitting lines across warehouses in the shop's priority order.
-- -----------------------------------------------------------------------------
create or replace function private.route_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order     public.orders;
  v_item      public.order_items;
  v_wh        uuid;
  v_single    uuid;
  v_remaining integer;
  v_take      integer;
  v_available integer;
  v_sku       text;
begin
  select * into v_order from public.orders where id = p_order_id;

  if not exists (
    select 1 from public.shop_warehouses sw join public.warehouses w on w.id = sw.warehouse_id
    where sw.shop_id = v_order.shop_id and w.is_active
  ) then
    raise exception 'No active warehouse fulfils orders for this shop. Link one under Warehouses.'
      using errcode = 'check_violation';
  end if;

  -- 1) A single warehouse that has every line in stock.
  select sw.warehouse_id into v_single
  from public.shop_warehouses sw
  join public.warehouses w on w.id = sw.warehouse_id and w.is_active
  where sw.shop_id = v_order.shop_id
    and not exists (
      select 1 from public.order_items oi
      left join public.inventory_levels il on il.variant_id = oi.variant_id and il.warehouse_id = sw.warehouse_id
      where oi.order_id = p_order_id and coalesce(il.available, 0) < oi.quantity
    )
  order by sw.priority, w.name
  limit 1;

  for v_item in select * from public.order_items where order_id = p_order_id order by created_at, id loop
    if v_single is not null then
      perform private.reserve_stock(v_order.organization_id, v_item.variant_id, v_single, v_item.quantity);
      insert into public.order_allocations (organization_id, order_id, order_item_id, variant_id, warehouse_id, quantity)
      values (v_order.organization_id, p_order_id, v_item.id, v_item.variant_id, v_single, v_item.quantity);
      continue;
    end if;

    -- 2) Split this line across warehouses by priority.
    v_remaining := v_item.quantity;
    for v_wh, v_available in
      select sw.warehouse_id, coalesce(il.available, 0)
      from public.shop_warehouses sw
      join public.warehouses w on w.id = sw.warehouse_id and w.is_active
      left join public.inventory_levels il on il.variant_id = v_item.variant_id and il.warehouse_id = sw.warehouse_id
      where sw.shop_id = v_order.shop_id
      order by sw.priority, w.name
    loop
      exit when v_remaining = 0;
      v_take := least(v_remaining, v_available);
      continue when v_take <= 0;
      perform private.reserve_stock(v_order.organization_id, v_item.variant_id, v_wh, v_take);
      insert into public.order_allocations (organization_id, order_id, order_item_id, variant_id, warehouse_id, quantity)
      values (v_order.organization_id, p_order_id, v_item.id, v_item.variant_id, v_wh, v_take);
      v_remaining := v_remaining - v_take;
    end loop;

    if v_remaining > 0 then
      select sku into v_sku from public.product_variants where id = v_item.variant_id;
      raise exception 'Not enough stock for % (% short)', v_sku, v_remaining using errcode = 'check_violation';
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- create_order: a phone / WhatsApp / counter order entered by staff.
-- p_customer: { full_name, email, phone }
-- p_address:  { name, phone, line1, line2, city, state, postal_code, country }
-- p_items:    [{ variant_id, quantity, unit_price? }]  (price defaults to the variant's)
-- -----------------------------------------------------------------------------
create or replace function public.create_order(
  p_shop_id         uuid,
  p_customer        jsonb,
  p_address         jsonb,
  p_items           jsonb,
  p_payment_method  public.payment_method,
  p_payment_status  public.payment_status default 'pending',
  p_shipping_total  numeric default 0,
  p_discount_total  numeric default 0,
  p_notes           text default null,
  p_confirm         boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop        public.shops;
  v_order_id    uuid;
  v_customer_id uuid;
  v_email       text := nullif(lower(btrim(p_customer ->> 'email')), '');
  v_phone       text := nullif(regexp_replace(coalesce(p_customer ->> 'phone', ''), '[\s-]', '', 'g'), '');
  v_name        text := nullif(btrim(p_customer ->> 'full_name'), '');
  v_line        jsonb;
  v_variant     record;
  v_qty         integer;
  v_price       numeric;
  v_subtotal    numeric := 0;
  v_tax         numeric := 0;
begin
  select * into v_shop from public.shops where id = p_shop_id;
  if v_shop.id is null or not private.can_access_shop(v_shop.organization_id, v_shop.id) then
    raise exception 'Shop not found' using errcode = 'no_data_found';
  end if;
  if not private.has_org_role(v_shop.organization_id, array['owner', 'admin', 'manager', 'staff']::public.org_role[]) then
    raise exception 'Not allowed to create orders' using errcode = '42501';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'An order can have at most 100 lines' using errcode = 'check_violation';
  end if;
  if (select count(distinct x ->> 'variant_id') from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) then
    raise exception 'Each product variant can appear only once' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_address ->> 'name'), '') = '' or coalesce(btrim(p_address ->> 'line1'), '') = ''
     or coalesce(btrim(p_address ->> 'city'), '') = '' or coalesce(btrim(p_address ->> 'postal_code'), '') = ''
     or coalesce(btrim(p_address ->> 'phone'), '') = '' then
    raise exception 'The shipping address needs a name, phone, street, city and PIN code' using errcode = 'check_violation';
  end if;
  if p_shipping_total < 0 or p_discount_total < 0 then
    raise exception 'Shipping and discount cannot be negative' using errcode = 'check_violation';
  end if;

  -- Customer: match on email, then phone, within the organization.
  if v_email is not null or v_phone is not null then
    select id into v_customer_id from public.customers
    where organization_id = v_shop.organization_id
      and ((v_email is not null and email = v_email::extensions.citext) or (v_phone is not null and phone = v_phone))
    order by (email = v_email::extensions.citext) desc nulls last
    limit 1;

    if v_customer_id is null then
      insert into public.customers (organization_id, email, phone, full_name)
      values (v_shop.organization_id, v_email, v_phone, v_name)
      returning id into v_customer_id;
    else
      update public.customers
      set full_name = coalesce(full_name, v_name),
          email = coalesce(email, v_email::extensions.citext),
          phone = coalesce(phone, v_phone)
      where id = v_customer_id;
    end if;
  end if;

  insert into public.orders (
    organization_id, shop_id, customer_id, payment_method, payment_status, currency,
    shipping_total, discount_total, shipping_address, notes, paid_at
  ) values (
    v_shop.organization_id, v_shop.id, v_customer_id, p_payment_method, p_payment_status, v_shop.currency,
    round(p_shipping_total, 2), round(p_discount_total, 2), p_address, nullif(btrim(p_notes), ''),
    case when p_payment_status = 'paid' then now() end
  )
  returning id into v_order_id;

  for v_line in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_line ->> 'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 10000 then
      raise exception 'Quantities must be between 1 and 10,000' using errcode = 'check_violation';
    end if;

    select v.id, v.sku, v.price, v.title as variant_title, p.title as product_title, p.tracking, p.status,
           coalesce(p.gst_rate, c.gst_rate, 0) as gst_rate
    into v_variant
    from public.product_variants v
    join public.products p on p.id = v.product_id
    left join public.categories c on c.id = p.category_id
    where v.id = (v_line ->> 'variant_id')::uuid
      and v.organization_id = v_shop.organization_id
      and v.is_active;

    if v_variant.id is null then
      raise exception 'A product in this order no longer exists' using errcode = 'check_violation';
    end if;
    if v_variant.status = 'archived' then
      raise exception '% is archived and cannot be sold', v_variant.product_title using errcode = 'check_violation';
    end if;

    v_price := round(coalesce((v_line ->> 'unit_price')::numeric, v_variant.price), 2);
    if v_price < 0 then
      raise exception 'Prices cannot be negative' using errcode = 'check_violation';
    end if;

    insert into public.order_items (
      organization_id, order_id, variant_id, title, sku, quantity, unit_price, tracking, gst_rate, tax_amount
    ) values (
      v_shop.organization_id, v_order_id, v_variant.id,
      v_variant.product_title || case when v_variant.variant_title <> 'Default' then ' · ' || v_variant.variant_title else '' end,
      v_variant.sku, v_qty, v_price, v_variant.tracking, v_variant.gst_rate,
      round(v_qty * v_price * v_variant.gst_rate / (100 + v_variant.gst_rate), 2)
    );

    v_subtotal := v_subtotal + v_qty * v_price;
    v_tax := v_tax + round(v_qty * v_price * v_variant.gst_rate / (100 + v_variant.gst_rate), 2);
  end loop;

  if p_discount_total > v_subtotal then
    raise exception 'The discount is larger than the order subtotal' using errcode = 'check_violation';
  end if;

  update public.orders
  set subtotal = v_subtotal,
      tax_total = v_tax,
      grand_total = v_subtotal - round(p_discount_total, 2) + round(p_shipping_total, 2)
  where id = v_order_id;

  perform private.add_order_event(v_shop.organization_id, v_order_id, 'order.created',
    'Order created', jsonb_build_object('lines', jsonb_array_length(p_items)));

  if p_confirm then
    perform public.confirm_order(v_order_id);
  end if;

  return v_order_id;
end;
$$;

create or replace function public.confirm_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_wh    text;
begin
  v_order := private.authorize_order(p_order_id, array['owner', 'admin', 'manager', 'staff']::public.org_role[]);
  if v_order.status <> 'pending' then
    raise exception 'Only pending orders can be confirmed' using errcode = 'check_violation';
  end if;

  perform private.route_order(p_order_id);

  update public.orders set status = 'confirmed', confirmed_at = now() where id = p_order_id;

  select string_agg(distinct w.name, ', ') into v_wh
  from public.order_allocations a join public.warehouses w on w.id = a.warehouse_id
  where a.order_id = p_order_id;

  perform private.add_order_event(v_order.organization_id, p_order_id, 'order.confirmed',
    'Confirmed; stock reserved at ' || v_wh);
end;
$$;

create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_alloc public.order_allocations;
begin
  v_order := private.authorize_order(p_order_id, array['owner', 'admin', 'manager']::public.org_role[]);
  if v_order.status in ('cancelled', 'completed') then
    raise exception 'This order is already %', v_order.status using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.shipments
    where order_id = p_order_id and status not in ('cancelled', 'returned_to_origin')
  ) then
    raise exception 'Cancel or return its shipments first' using errcode = 'check_violation';
  end if;

  for v_alloc in select * from public.order_allocations where order_id = p_order_id for update loop
    if v_alloc.quantity > v_alloc.shipped_quantity then
      perform private.release_stock(v_alloc.variant_id, v_alloc.warehouse_id, v_alloc.quantity - v_alloc.shipped_quantity);
    end if;
  end loop;
  delete from public.order_allocations a
  where a.order_id = p_order_id and a.shipped_quantity = 0
    and not exists (select 1 from public.shipment_items si where si.allocation_id = a.id);
  update public.order_allocations set quantity = shipped_quantity where order_id = p_order_id;

  update public.orders
  set status = 'cancelled', cancelled_at = now(), cancel_reason = nullif(btrim(p_reason), '')
  where id = p_order_id;

  perform private.add_order_event(v_order.organization_id, p_order_id, 'order.cancelled',
    'Cancelled' || coalesce(': ' || nullif(btrim(p_reason), ''), ''),
    jsonb_build_object('refund_due', v_order.payment_status = 'paid'));
end;
$$;

create or replace function public.mark_order_paid(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  v_order := private.authorize_order(p_order_id, array['owner', 'admin', 'manager', 'staff']::public.org_role[]);
  if v_order.payment_status = 'paid' then
    return;
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'This order is cancelled' using errcode = 'check_violation';
  end if;
  update public.orders set payment_status = 'paid', paid_at = now() where id = p_order_id;
  perform private.add_order_event(v_order.organization_id, p_order_id, 'payment.paid',
    'Payment received' || coalesce(' (' || v_order.payment_method::text || ')', ''));
end;
$$;

-- Recompute an order's fulfilment status (and completion) from its lines and shipments.
create or replace function private.refresh_order_fulfilment(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order        public.orders;
  v_total        integer;
  v_fulfilled    integer;
  v_status       public.fulfillment_status;
  v_all_returned boolean;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  select sum(quantity), sum(fulfilled_quantity) into v_total, v_fulfilled
  from public.order_items where order_id = p_order_id;

  select coalesce(bool_and(status = 'returned_to_origin'), false) into v_all_returned
  from public.shipments where order_id = p_order_id and status <> 'cancelled';

  v_status := case
    when v_all_returned then 'returned'
    when v_fulfilled = 0 then 'unfulfilled'
    when v_fulfilled < v_total then 'partially_fulfilled'
    else 'fulfilled'
  end;

  update public.orders set fulfillment_status = v_status where id = p_order_id;

  -- Everything shipped and every live shipment delivered: the order is complete.
  if v_status = 'fulfilled' and v_order.status = 'confirmed'
     and not exists (
       select 1 from public.shipments
       where order_id = p_order_id and status not in ('delivered', 'cancelled')
     ) then
    update public.orders
    set status = 'completed',
        completed_at = now(),
        payment_status = case when payment_method = 'cod' then 'paid'::public.payment_status else payment_status end,
        paid_at = case when payment_method = 'cod' and payment_status <> 'paid' then now() else paid_at end
    where id = p_order_id;
    if v_order.payment_method = 'cod' and v_order.payment_status <> 'paid' then
      perform private.add_order_event(v_order.organization_id, p_order_id, 'payment.paid', 'Cash collected on delivery');
    end if;
    perform private.add_order_event(v_order.organization_id, p_order_id, 'order.completed', 'Order completed');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- create_shipment: pick and pack from one warehouse.
-- p_items: [{ order_item_id, quantity, serials? }]
-- Serial items must name the exact units; batch items are picked FEFO,
-- skipping expired batches. Stock leaves the warehouse here (movement 'sale').
-- -----------------------------------------------------------------------------
create or replace function public.create_shipment(
  p_order_id          uuid,
  p_warehouse_id      uuid,
  p_items             jsonb,
  p_carrier           text default null,
  p_tracking_number   text default null,
  p_estimated_delivery timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order       public.orders;
  v_shipment_id uuid := gen_random_uuid();
  v_line        jsonb;
  v_item        public.order_items;
  v_alloc       public.order_allocations;
  v_qty         integer;
  v_serials     text[];
  v_found       integer;
  v_batches     jsonb;
  v_batch       public.inventory_batches;
  v_need        integer;
  v_take        integer;
  v_count       integer;
  v_wh_name     text;
begin
  v_order := private.authorize_order(p_order_id, array['owner', 'admin', 'manager', 'staff']::public.org_role[]);
  if v_order.status <> 'confirmed' then
    raise exception 'Only confirmed orders can be shipped' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Choose at least one item to ship' using errcode = 'check_violation';
  end if;

  select count(*) + 1 into v_count from public.shipments where order_id = p_order_id;
  insert into public.shipments (
    id, organization_id, order_id, warehouse_id, status, carrier, tracking_number, estimated_delivery, number
  ) values (
    v_shipment_id, v_order.organization_id, p_order_id, p_warehouse_id, 'packed',
    nullif(btrim(p_carrier), ''), nullif(upper(btrim(p_tracking_number)), ''), p_estimated_delivery,
    v_order.number || '-' || v_count
  );

  for v_line in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_line ->> 'quantity')::integer;
    continue when coalesce(v_qty, 0) = 0;
    if v_qty < 0 then
      raise exception 'Quantities must be positive' using errcode = 'check_violation';
    end if;

    select * into v_item from public.order_items
    where id = (v_line ->> 'order_item_id')::uuid and order_id = p_order_id;
    if v_item.id is null then
      raise exception 'That item is not part of this order' using errcode = 'check_violation';
    end if;

    select * into v_alloc from public.order_allocations
    where order_item_id = v_item.id and warehouse_id = p_warehouse_id
    for update;
    if v_alloc.id is null or v_alloc.quantity - v_alloc.shipped_quantity < v_qty then
      raise exception 'Only % of % is waiting to ship from this warehouse',
        coalesce(v_alloc.quantity - v_alloc.shipped_quantity, 0), v_item.sku
        using errcode = 'check_violation';
    end if;

    v_serials := null;
    v_batches := '[]'::jsonb;

    -- The reservation becomes the shipment: release it, then take the stock out.
    perform private.release_stock(v_item.variant_id, p_warehouse_id, v_qty);

    case v_item.tracking
      when 'serial' then
        v_serials := private.clean_serials(array(select jsonb_array_elements_text(coalesce(v_line -> 'serials', '[]'))));
        if cardinality(v_serials) <> v_qty then
          raise exception 'Scan % serial number(s) for %', v_qty, v_item.sku using errcode = 'check_violation';
        end if;
        update public.inventory_serials
        set status = 'sold'
        where organization_id = v_order.organization_id and variant_id = v_item.variant_id
          and warehouse_id = p_warehouse_id and status = 'in_stock' and serial_number = any (v_serials);
        get diagnostics v_found = row_count;
        if v_found <> v_qty then
          raise exception 'Some serial numbers for % are not in stock at this warehouse', v_item.sku
            using errcode = 'check_violation';
        end if;
        perform private.apply_stock_delta(v_order.organization_id, v_item.variant_id, p_warehouse_id, -v_qty,
          'sale', 'Shipment ' || v_order.number, 'shipment', v_shipment_id, v_serials, null);

      when 'batch' then
        v_need := v_qty;
        for v_batch in
          select * from public.inventory_batches
          where variant_id = v_item.variant_id and warehouse_id = p_warehouse_id and on_hand > 0
            and (expiry_date is null or expiry_date >= current_date)
          order by expiry_date nulls last, received_at
          for update
        loop
          exit when v_need = 0;
          v_take := least(v_need, v_batch.on_hand);
          update public.inventory_batches set on_hand = on_hand - v_take where id = v_batch.id;
          perform private.apply_stock_delta(v_order.organization_id, v_item.variant_id, p_warehouse_id, -v_take,
            'sale', 'Shipment ' || v_order.number, 'shipment', v_shipment_id, null, v_batch.id);
          v_batches := v_batches || jsonb_build_object('batch_id', v_batch.id, 'batch_code', v_batch.batch_code,
            'expiry_date', v_batch.expiry_date, 'quantity', v_take);
          v_need := v_need - v_take;
        end loop;
        if v_need > 0 then
          raise exception 'Not enough unexpired batches of % at this warehouse (% short)', v_item.sku, v_need
            using errcode = 'check_violation';
        end if;

      else
        perform private.apply_stock_delta(v_order.organization_id, v_item.variant_id, p_warehouse_id, -v_qty,
          'sale', 'Shipment ' || v_order.number, 'shipment', v_shipment_id, null, null);
    end case;

    update public.order_allocations set shipped_quantity = shipped_quantity + v_qty where id = v_alloc.id;
    update public.order_items set fulfilled_quantity = fulfilled_quantity + v_qty where id = v_item.id;

    insert into public.shipment_items (organization_id, shipment_id, order_item_id, allocation_id, quantity, serial_numbers, batches)
    values (v_order.organization_id, v_shipment_id, v_item.id, v_alloc.id, v_qty, coalesce(v_serials, '{}'), v_batches);
  end loop;

  if not exists (select 1 from public.shipment_items where shipment_id = v_shipment_id) then
    raise exception 'Choose at least one item to ship' using errcode = 'check_violation';
  end if;

  insert into public.shipment_events (organization_id, shipment_id, status, description)
  values (v_order.organization_id, v_shipment_id, 'packed', 'Packed and ready for pickup');

  select name into v_wh_name from public.warehouses where id = p_warehouse_id;
  perform private.add_order_event(v_order.organization_id, p_order_id, 'shipment.created',
    'Shipment ' || v_order.number || '-' || v_count || ' packed at ' || v_wh_name,
    jsonb_build_object('shipment_id', v_shipment_id));
  perform private.refresh_order_fulfilment(p_order_id);

  return v_shipment_id;
end;
$$;

-- Put a shipment's goods back on the shelf.
--  * cancelled before pickup (p_rereserve): the order still wants them, so the
--    lines go back to "waiting to ship" and the stock is reserved again;
--  * returned to origin: stock comes back as a return, while the shipment and
--    its lines stay on record (the order shows as returned).
create or replace function private.restock_shipment(p_shipment public.shipments, p_rereserve boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_si      public.shipment_items;
  v_variant uuid;
  v_type    public.stock_movement_type := case when p_rereserve then 'adjustment' else 'return' end;
  v_b       jsonb;
begin
  for v_si in select * from public.shipment_items where shipment_id = p_shipment.id loop
    select variant_id into v_variant from public.order_items where id = v_si.order_item_id;

    if cardinality(v_si.serial_numbers) > 0 then
      update public.inventory_serials
      set status = 'in_stock', warehouse_id = p_shipment.warehouse_id
      where organization_id = p_shipment.organization_id and serial_number = any (v_si.serial_numbers);
      perform private.apply_stock_delta(p_shipment.organization_id, v_variant, p_shipment.warehouse_id,
        v_si.quantity, v_type, p_note, 'shipment', p_shipment.id, v_si.serial_numbers, null);
    elsif jsonb_array_length(v_si.batches) > 0 then
      for v_b in select * from jsonb_array_elements(v_si.batches) loop
        update public.inventory_batches set on_hand = on_hand + (v_b ->> 'quantity')::integer
        where id = (v_b ->> 'batch_id')::uuid;
        perform private.apply_stock_delta(p_shipment.organization_id, v_variant, p_shipment.warehouse_id,
          (v_b ->> 'quantity')::integer, v_type, p_note, 'shipment', p_shipment.id, null, (v_b ->> 'batch_id')::uuid);
      end loop;
    else
      perform private.apply_stock_delta(p_shipment.organization_id, v_variant, p_shipment.warehouse_id,
        v_si.quantity, v_type, p_note, 'shipment', p_shipment.id, null, null);
    end if;

    if p_rereserve then
      update public.order_allocations set shipped_quantity = shipped_quantity - v_si.quantity where id = v_si.allocation_id;
      update public.order_items set fulfilled_quantity = fulfilled_quantity - v_si.quantity where id = v_si.order_item_id;
      perform private.reserve_stock(p_shipment.organization_id, v_variant, p_shipment.warehouse_id, v_si.quantity);
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- update_shipment_status: move a parcel along. Returns the delivery OTP (once)
-- when the parcel goes out for delivery; the database keeps only its hash.
-- -----------------------------------------------------------------------------
create or replace function public.update_shipment_status(
  p_shipment_id uuid,
  p_status      public.shipment_status,
  p_description text default null,
  p_location    text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ship    public.shipments;
  v_order   public.orders;
  v_otp     text;
  v_rand    bytea;
  v_allowed public.shipment_status[];
begin
  select * into v_ship from public.shipments where id = p_shipment_id for update;
  if v_ship.id is null then
    raise exception 'Shipment not found' using errcode = 'no_data_found';
  end if;
  v_order := private.authorize_order(v_ship.order_id, array['owner', 'admin', 'manager', 'staff']::public.org_role[]);

  v_allowed := case v_ship.status
    when 'packed'           then array['picked_up', 'cancelled']
    when 'picked_up'        then array['in_transit', 'out_for_delivery', 'returned_to_origin']
    when 'in_transit'       then array['out_for_delivery', 'returned_to_origin']
    when 'out_for_delivery' then array['failed_attempt', 'returned_to_origin']
    when 'failed_attempt'   then array['out_for_delivery', 'returned_to_origin']
    else array[]::text[]
  end::public.shipment_status[];

  if p_status = 'delivered' then
    raise exception 'Deliveries are confirmed with the customer''s OTP' using errcode = 'check_violation';
  end if;
  if not (p_status = any (v_allowed)) then
    raise exception 'A % shipment cannot become %', replace(v_ship.status::text, '_', ' '), replace(p_status::text, '_', ' ')
      using errcode = 'check_violation';
  end if;

  if p_status = 'out_for_delivery' then
    -- 6 digits from a CSPRNG; stored as a bcrypt hash, valid for 24 hours.
    v_rand := extensions.gen_random_bytes(4);
    v_otp := lpad((((get_byte(v_rand, 0)::bigint << 24) | (get_byte(v_rand, 1) << 16)
                    | (get_byte(v_rand, 2) << 8) | get_byte(v_rand, 3)) % 1000000)::text, 6, '0');
    update public.shipments
    set status = p_status,
        delivery_otp_hash = extensions.crypt(v_otp, extensions.gen_salt('bf', 8)),
        otp_expires_at = now() + interval '24 hours',
        otp_attempts = 0,
        delivery_attempts = delivery_attempts + 1,
        shipped_at = coalesce(shipped_at, now())
    where id = p_shipment_id;
  else
    update public.shipments
    set status = p_status,
        shipped_at = case when p_status = 'picked_up' then now() else shipped_at end,
        cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end,
        returned_at = case when p_status = 'returned_to_origin' then now() else returned_at end,
        delivery_otp_hash = case when p_status in ('failed_attempt', 'returned_to_origin', 'cancelled') then null else delivery_otp_hash end,
        otp_expires_at = case when p_status in ('failed_attempt', 'returned_to_origin', 'cancelled') then null else otp_expires_at end
    where id = p_shipment_id;
  end if;

  if p_status = 'cancelled' then
    perform private.restock_shipment(v_ship, true, 'Shipment ' || v_ship.number || ' cancelled before pickup');
  elsif p_status = 'returned_to_origin' then
    perform private.restock_shipment(v_ship, false, 'Shipment ' || v_ship.number || ' returned to origin');
  end if;

  insert into public.shipment_events (organization_id, shipment_id, status, description, location)
  values (v_ship.organization_id, p_shipment_id, p_status,
          coalesce(nullif(btrim(p_description), ''), initcap(replace(p_status::text, '_', ' '))),
          nullif(btrim(p_location), ''));

  perform private.add_order_event(v_ship.organization_id, v_ship.order_id, 'shipment.' || p_status::text,
    'Shipment ' || v_ship.number || ': ' || replace(p_status::text, '_', ' ')
      || coalesce(' — ' || nullif(btrim(p_description), ''), ''),
    jsonb_build_object('shipment_id', p_shipment_id));

  if p_status in ('cancelled', 'returned_to_origin') then
    perform private.refresh_order_fulfilment(v_ship.order_id);
  end if;

  return v_otp;
end;
$$;

-- -----------------------------------------------------------------------------
-- confirm_delivery: the courier enters the customer's OTP. Wrong codes are
-- counted (not raised, so the count survives); 5 misses lock the code.
-- Returns { ok, attempts_left?, message? }.
-- -----------------------------------------------------------------------------
create or replace function public.confirm_delivery(p_shipment_id uuid, p_otp text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ship  public.shipments;
  v_order public.orders;
  c_max   constant integer := 5;
begin
  select * into v_ship from public.shipments where id = p_shipment_id for update;
  if v_ship.id is null then
    raise exception 'Shipment not found' using errcode = 'no_data_found';
  end if;
  v_order := private.authorize_order(v_ship.order_id, array['owner', 'admin', 'manager', 'staff']::public.org_role[]);

  if v_ship.status <> 'out_for_delivery' or v_ship.delivery_otp_hash is null then
    return jsonb_build_object('ok', false, 'message', 'This shipment is not out for delivery');
  end if;
  if v_ship.otp_expires_at < now() then
    return jsonb_build_object('ok', false, 'message', 'The code has expired. Send the parcel out again to get a new one.');
  end if;
  if v_ship.otp_attempts >= c_max then
    return jsonb_build_object('ok', false, 'message', 'Too many wrong codes. Send the parcel out again to get a new one.');
  end if;

  if p_otp is null or p_otp !~ '^[0-9]{6}$'
     or extensions.crypt(p_otp, v_ship.delivery_otp_hash) <> v_ship.delivery_otp_hash then
    update public.shipments set otp_attempts = otp_attempts + 1 where id = p_shipment_id;
    return jsonb_build_object('ok', false, 'attempts_left', c_max - v_ship.otp_attempts - 1,
      'message', 'That code is not right');
  end if;

  update public.shipments
  set status = 'delivered', delivered_at = now(), delivery_otp_hash = null, otp_expires_at = null
  where id = p_shipment_id;

  insert into public.shipment_events (organization_id, shipment_id, status, description)
  values (v_ship.organization_id, p_shipment_id, 'delivered', 'Delivered (OTP verified)');
  perform private.add_order_event(v_ship.organization_id, v_ship.order_id, 'shipment.delivered',
    'Shipment ' || v_ship.number || ' delivered; customer OTP verified', jsonb_build_object('shipment_id', p_shipment_id));
  perform private.refresh_order_fulfilment(v_ship.order_id);

  return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- Public tracking: anyone with the link sees the parcel's journey, but no
-- personal data beyond the destination city.
-- -----------------------------------------------------------------------------
create or replace function public.get_tracking(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'shop', jsonb_build_object('name', sh.name),
    'order_number', o.number,
    'shipment_number', s.number,
    'status', s.status,
    'carrier', s.carrier,
    'tracking_number', s.tracking_number,
    'estimated_delivery', s.estimated_delivery,
    'shipped_at', s.shipped_at,
    'delivered_at', s.delivered_at,
    'destination', nullif(concat_ws(', ', o.shipping_address ->> 'city', o.shipping_address ->> 'state'), ''),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('title', oi.title, 'quantity', si.quantity) order by oi.title)
      from public.shipment_items si join public.order_items oi on oi.id = si.order_item_id
      where si.shipment_id = s.id), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('status', e.status, 'description', e.description,
                                          'location', e.location, 'occurred_at', e.occurred_at)
                       order by e.occurred_at desc, e.id desc)
      from public.shipment_events e where e.shipment_id = s.id), '[]'::jsonb)
  )
  from public.shipments s
  join public.orders o on o.id = s.order_id
  join public.shops sh on sh.id = o.shop_id
  where p_token ~ '^[0-9a-f]{32}$' and s.tracking_token = p_token;
$$;

-- -----------------------------------------------------------------------------
-- Overview for the orders list
-- -----------------------------------------------------------------------------
create view public.order_overview
with (security_invoker = true) as
select
  o.id,
  o.organization_id,
  o.shop_id,
  sh.name as shop_name,
  o.number,
  o.status,
  o.payment_status,
  o.payment_method,
  o.fulfillment_status,
  o.currency,
  o.grand_total,
  o.placed_at,
  o.customer_id,
  coalesce(c.full_name, o.shipping_address ->> 'name') as customer_name,
  coalesce(c.phone, o.shipping_address ->> 'phone') as customer_phone,
  c.email::text as customer_email,
  o.shipping_address ->> 'city' as city,
  (select coalesce(sum(quantity), 0) from public.order_items oi where oi.order_id = o.id) as item_count,
  lower(o.number || ' ' || coalesce(c.full_name, o.shipping_address ->> 'name', '') || ' '
        || coalesce(c.phone, o.shipping_address ->> 'phone', '') || ' ' || coalesce(c.email::text, '')) as search_text
from public.orders o
join public.shops sh on sh.id = o.shop_id
left join public.customers c on c.id = o.customer_id;

create view public.shipment_overview
with (security_invoker = true) as
select
  s.id,
  s.organization_id,
  s.order_id,
  o.shop_id,
  o.number as order_number,
  s.number,
  s.status,
  s.carrier,
  s.tracking_number,
  s.tracking_token,
  s.warehouse_id,
  w.name as warehouse_name,
  s.estimated_delivery,
  s.shipped_at,
  s.delivered_at,
  s.delivery_attempts,
  s.created_at,
  s.updated_at,
  o.shipping_address ->> 'name' as recipient_name,
  o.shipping_address ->> 'phone' as recipient_phone,
  o.shipping_address ->> 'city' as city,
  o.payment_method,
  o.payment_status,
  o.grand_total,
  o.currency,
  (select coalesce(sum(quantity), 0) from public.shipment_items si where si.shipment_id = s.id) as item_count
from public.shipments s
join public.orders o on o.id = s.order_id
join public.warehouses w on w.id = s.warehouse_id;

-- -----------------------------------------------------------------------------
-- Privileges & RLS: read through RLS, write only through the functions above
-- -----------------------------------------------------------------------------
alter table public.order_allocations enable row level security;
alter table public.shipment_items    enable row level security;
alter table public.order_events      enable row level security;

create policy "allocations: read with order access" on public.order_allocations
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and private.can_access_shop(o.organization_id, o.shop_id)));
create policy "shipment items: read with shipment access" on public.shipment_items
  for select to authenticated
  using (exists (
    select 1 from public.shipments s join public.orders o on o.id = s.order_id
    where s.id = shipment_id and private.can_access_shop(o.organization_id, o.shop_id)
  ));
create policy "order events: read with order access" on public.order_events
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and private.can_access_shop(o.organization_id, o.shop_id)));

revoke insert, update, delete on public.orders, public.order_items, public.shipments, public.shipment_events,
  public.order_allocations, public.shipment_items, public.order_events from authenticated, anon;
revoke all on public.order_allocations, public.shipment_items, public.order_events from anon;
-- Staff may edit an order's internal note directly.
grant update (notes) on public.orders to authenticated;

-- The tracking token and OTP bookkeeping are not for the admin UI to read raw.
revoke select on public.shipments from authenticated;
grant select (
  id, organization_id, order_id, warehouse_id, status, carrier, tracking_number,
  estimated_delivery, shipped_at, delivered_at, created_at, updated_at, number, tracking_token,
  otp_expires_at, otp_attempts, delivery_attempts, cancelled_at, returned_at
) on public.shipments to authenticated;

revoke all on public.order_overview, public.shipment_overview from anon;
grant select on public.order_overview, public.shipment_overview to authenticated;

revoke all on function public.create_order(uuid, jsonb, jsonb, jsonb, public.payment_method, public.payment_status, numeric, numeric, text, boolean) from public, anon;
revoke all on function public.confirm_order(uuid) from public, anon;
revoke all on function public.cancel_order(uuid, text) from public, anon;
revoke all on function public.mark_order_paid(uuid) from public, anon;
revoke all on function public.create_shipment(uuid, uuid, jsonb, text, text, timestamptz) from public, anon;
revoke all on function public.update_shipment_status(uuid, public.shipment_status, text, text) from public, anon;
revoke all on function public.confirm_delivery(uuid, text) from public, anon;
grant execute on function public.create_order(uuid, jsonb, jsonb, jsonb, public.payment_method, public.payment_status, numeric, numeric, text, boolean) to authenticated;
grant execute on function public.confirm_order(uuid) to authenticated;
grant execute on function public.cancel_order(uuid, text) to authenticated;
grant execute on function public.mark_order_paid(uuid) to authenticated;
grant execute on function public.create_shipment(uuid, uuid, jsonb, text, text, timestamptz) to authenticated;
grant execute on function public.update_shipment_status(uuid, public.shipment_status, text, text) to authenticated;
grant execute on function public.confirm_delivery(uuid, text) to authenticated;

revoke all on function public.get_tracking(text) from public;
grant execute on function public.get_tracking(text) to anon, authenticated;
