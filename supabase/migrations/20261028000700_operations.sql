-- =============================================================================
-- Shopverse · Migration 025 · Operations
--
--  * Suppliers and purchase orders. A PO is drafted, placed with the supplier,
--    then received (in parts, with serials or batches where the product needs
--    them) straight into a warehouse's stock. Receiving records the unit cost
--    as the variant's latest cost.
--  * Low-stock alerts: when a variant's available stock in a warehouse falls to
--    its reorder point, an alert opens (one per variant and warehouse) and
--    closes again once stock is back above it. The app emails open alerts and
--    a daily digest; reorder suggestions turn them into purchase orders.
--  * Couriers: a shipment can be booked with a courier (AWB, service, cost,
--    package, cash to collect). Tracking updates from the courier move the
--    shipment along, including delivery on the courier's proof of delivery.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Suppliers
-- -----------------------------------------------------------------------------
create table public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 2 and 120),
  contact_name    text check (contact_name is null or char_length(contact_name) <= 120),
  email           text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone           text check (phone is null or phone ~ '^[0-9+ ()-]{6,20}$'),
  gstin           text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  address         jsonb not null default '{}'::jsonb,
  payment_terms   text check (payment_terms is null or char_length(payment_terms) <= 120),
  lead_time_days  integer check (lead_time_days is null or lead_time_days between 0 and 365),
  notes           text check (notes is null or char_length(notes) <= 1000),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, id)
);

create unique index suppliers_name_uidx on public.suppliers (organization_id, lower(name));

create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function private.set_updated_at();
create trigger suppliers_audit
  after insert or update or delete on public.suppliers
  for each row execute function private.audit_row_change('supplier');

alter table public.suppliers enable row level security;
create policy "suppliers: members read" on public.suppliers
  for select to authenticated using (private.is_org_member(organization_id));
create policy "suppliers: managers write" on public.suppliers
  for all to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]));
revoke all on public.suppliers from anon;

-- -----------------------------------------------------------------------------
-- Purchase orders
-- -----------------------------------------------------------------------------
create type public.purchase_order_status as enum (
  'draft', 'ordered', 'partially_received', 'received', 'closed', 'cancelled'
);

create table public.purchase_orders (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  number             text not null,
  supplier_id        uuid not null,
  warehouse_id       uuid not null,
  status             public.purchase_order_status not null default 'draft',
  expected_at        date,
  supplier_reference text check (supplier_reference is null or char_length(supplier_reference) <= 60),
  notes              text check (notes is null or char_length(notes) <= 2000),
  subtotal           numeric(14, 2) not null default 0,
  tax_total          numeric(14, 2) not null default 0,
  total              numeric(14, 2) not null default 0,
  ordered_at         timestamptz,
  received_at        timestamptz,
  closed_at          timestamptz,
  cancelled_at       timestamptz,
  created_by         uuid references auth.users (id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, number),
  unique (organization_id, id),
  foreign key (organization_id, supplier_id) references public.suppliers (organization_id, id) on delete restrict,
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id) on delete restrict
);

create index purchase_orders_org_idx on public.purchase_orders (organization_id, status, created_at desc);

create table public.purchase_order_items (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null,
  purchase_order_id uuid not null,
  variant_id        uuid not null,
  quantity          integer not null check (quantity between 1 and 100000),
  received_quantity integer not null default 0 check (received_quantity >= 0 and received_quantity <= quantity),
  unit_cost         numeric(12, 2) not null check (unit_cost >= 0),
  tax_rate          numeric(5, 2) not null default 0 check (tax_rate between 0 and 100),
  position          integer not null default 0,
  unique (purchase_order_id, variant_id),
  foreign key (organization_id, purchase_order_id) references public.purchase_orders (organization_id, id) on delete cascade,
  foreign key (organization_id, variant_id) references public.product_variants (organization_id, id) on delete restrict
);

create index purchase_order_items_variant_idx on public.purchase_order_items (variant_id);

create trigger purchase_orders_set_updated_at
  before update on public.purchase_orders
  for each row execute function private.set_updated_at();

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
create policy "purchase orders: members read" on public.purchase_orders
  for select to authenticated using (private.is_org_member(organization_id));
create policy "purchase order items: members read" on public.purchase_order_items
  for select to authenticated using (private.is_org_member(organization_id));
revoke all on public.purchase_orders, public.purchase_order_items from anon;
revoke insert, update, delete, truncate on public.purchase_orders, public.purchase_order_items from authenticated;

create view public.purchase_order_overview
with (security_invoker = true) as
select
  po.id, po.organization_id, po.number, po.status, po.supplier_id, s.name as supplier_name,
  po.warehouse_id, w.name as warehouse_name, po.expected_at, po.total, po.ordered_at, po.received_at,
  po.created_at, po.supplier_reference,
  coalesce(i.lines, 0) as line_count,
  coalesce(i.ordered, 0) as ordered_quantity,
  coalesce(i.received, 0) as received_quantity
from public.purchase_orders po
join public.suppliers s on s.id = po.supplier_id
join public.warehouses w on w.id = po.warehouse_id
left join lateral (
  select count(*)::int as lines, sum(quantity)::int as ordered, sum(received_quantity)::int as received
  from public.purchase_order_items where purchase_order_id = po.id
) i on true;

grant select on public.purchase_order_overview to authenticated;

create or replace function private.authorize_purchase_order(p_id uuid, p_roles public.org_role[])
returns public.purchase_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po public.purchase_orders;
begin
  select * into v_po from public.purchase_orders where id = p_id for update;
  if v_po.id is null then
    raise exception 'Purchase order not found' using errcode = 'no_data_found';
  end if;
  if not private.has_org_role(v_po.organization_id, p_roles) then
    raise exception 'You can''t change purchase orders' using errcode = '42501';
  end if;
  return v_po;
end;
$$;

/*
 * Create or update a draft. Items: [{ variant_id, quantity, unit_cost, tax_rate }].
 * Returns the purchase order id.
 */
create or replace function public.save_purchase_order(
  p_organization_id    uuid,
  p_purchase_order_id  uuid,
  p_supplier_id        uuid,
  p_warehouse_id       uuid,
  p_items              jsonb,
  p_expected_at        date default null,
  p_supplier_reference text default null,
  p_notes              text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid := p_purchase_order_id;
  v_po    public.purchase_orders;
  v_count integer;
begin
  if not private.has_org_role(p_organization_id, array['owner', 'admin', 'manager']::public.org_role[]) then
    raise exception 'Only owners, admins and managers can write purchase orders' using errcode = '42501';
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and organization_id = p_organization_id and is_active) then
    raise exception 'Choose an active supplier' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.warehouses where id = p_warehouse_id and organization_id = p_organization_id and is_active) then
    raise exception 'Choose an active warehouse' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one product' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'A purchase order can have at most 200 lines' using errcode = 'check_violation';
  end if;
  select count(*) into v_count
  from jsonb_array_elements(p_items) i
  join public.product_variants v on v.id = (i ->> 'variant_id')::uuid and v.organization_id = p_organization_id;
  if v_count <> jsonb_array_length(p_items) then
    raise exception 'Some products don''t belong to this business' using errcode = 'check_violation';
  end if;
  if (select count(distinct i ->> 'variant_id') from jsonb_array_elements(p_items) i) <> jsonb_array_length(p_items) then
    raise exception 'Each product can appear only once' using errcode = 'check_violation';
  end if;

  if v_id is null then
    insert into public.purchase_orders (organization_id, number, supplier_id, warehouse_id, expected_at, supplier_reference, notes)
    values (p_organization_id, 'PO-' || lpad(private.next_counter(p_organization_id, 'purchase_order')::text, 6, '0'),
            p_supplier_id, p_warehouse_id, p_expected_at, nullif(btrim(p_supplier_reference), ''), nullif(btrim(p_notes), ''))
    returning id into v_id;
  else
    v_po := private.authorize_purchase_order(v_id, array['owner', 'admin', 'manager']::public.org_role[]);
    if v_po.organization_id <> p_organization_id then
      raise exception 'Purchase order not found' using errcode = 'no_data_found';
    end if;
    if v_po.status <> 'draft' then
      raise exception 'Only drafts can be edited' using errcode = 'check_violation';
    end if;
    update public.purchase_orders
    set supplier_id = p_supplier_id, warehouse_id = p_warehouse_id, expected_at = p_expected_at,
        supplier_reference = nullif(btrim(p_supplier_reference), ''), notes = nullif(btrim(p_notes), '')
    where id = v_id;
    delete from public.purchase_order_items where purchase_order_id = v_id;
  end if;

  insert into public.purchase_order_items (organization_id, purchase_order_id, variant_id, quantity, unit_cost, tax_rate, position)
  select p_organization_id, v_id, (i ->> 'variant_id')::uuid, (i ->> 'quantity')::integer,
         round((i ->> 'unit_cost')::numeric, 2), coalesce(nullif(i ->> 'tax_rate', '')::numeric, 0), ord::integer
  from jsonb_array_elements(p_items) with ordinality as t(i, ord);

  update public.purchase_orders po
  set subtotal = t.subtotal, tax_total = t.tax, total = t.subtotal + t.tax
  from (
    select coalesce(sum(round(quantity * unit_cost, 2)), 0) as subtotal,
           coalesce(sum(round(quantity * unit_cost * tax_rate / 100, 2)), 0) as tax
    from public.purchase_order_items where purchase_order_id = v_id
  ) t
  where po.id = v_id;

  perform private.log_audit(p_organization_id, case when p_purchase_order_id is null then 'purchase_order.created' else 'purchase_order.updated' end,
    'purchase_order', v_id, jsonb_build_object('lines', jsonb_array_length(p_items)));
  return v_id;
end;
$$;

create or replace function public.place_purchase_order(p_purchase_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po public.purchase_orders;
begin
  v_po := private.authorize_purchase_order(p_purchase_order_id, array['owner', 'admin', 'manager']::public.org_role[]);
  if v_po.status <> 'draft' then
    raise exception 'This purchase order has already been placed' using errcode = 'check_violation';
  end if;
  update public.purchase_orders set status = 'ordered', ordered_at = now() where id = v_po.id;
  perform private.log_audit(v_po.organization_id, 'purchase_order.ordered', 'purchase_order', v_po.id,
    jsonb_build_object('number', v_po.number, 'total', v_po.total));
end;
$$;

/*
 * Receive goods into the PO's warehouse. Lines:
 * [{ item_id, quantity, serials?: [...], batch_code?, expiry_date? }]. Serial-
 * tracked lines receive one unit per serial. Returns { status, received }.
 */
create or replace function public.receive_purchase_order(p_purchase_order_id uuid, p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po       public.purchase_orders;
  v_line     jsonb;
  v_item     public.purchase_order_items;
  v_tracking public.inventory_tracking;
  v_qty      integer;
  v_serials  text[];
  v_total    integer := 0;
  v_note     text;
  v_status   public.purchase_order_status;
begin
  v_po := private.authorize_purchase_order(p_purchase_order_id, array['owner', 'admin', 'manager', 'staff']::public.org_role[]);
  if v_po.status not in ('ordered', 'partially_received') then
    raise exception 'Only placed purchase orders can be received' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Enter what arrived' using errcode = 'check_violation';
  end if;
  v_note := 'Received on ' || v_po.number;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_item from public.purchase_order_items
    where id = (v_line ->> 'item_id')::uuid and purchase_order_id = v_po.id for update;
    if v_item.id is null then
      raise exception 'That line isn''t on this purchase order' using errcode = 'check_violation';
    end if;
    select p.tracking into v_tracking
    from public.product_variants v join public.products p on p.id = v.product_id where v.id = v_item.variant_id;

    v_serials := null;
    if v_tracking = 'serial' then
      v_serials := array(select jsonb_array_elements_text(coalesce(v_line -> 'serials', '[]'::jsonb)));
      v_qty := cardinality(array(select x from unnest(v_serials) x where btrim(x) <> ''));
    else
      v_qty := coalesce((v_line ->> 'quantity')::integer, 0);
    end if;
    if v_qty = 0 then
      continue;
    end if;
    if v_qty < 0 or v_item.received_quantity + v_qty > v_item.quantity then
      raise exception 'More than ordered for one of the lines (% left)', v_item.quantity - v_item.received_quantity
        using errcode = 'check_violation';
    end if;

    perform public.receive_stock(
      v_item.variant_id, v_po.warehouse_id,
      case when v_tracking = 'serial' then null else v_qty end,
      v_serials,
      nullif(btrim(v_line ->> 'batch_code'), ''),
      nullif(v_line ->> 'expiry_date', '')::date,
      v_note, 'receipt');

    update public.purchase_order_items set received_quantity = received_quantity + v_qty where id = v_item.id;
    -- The latest price paid becomes the variant's cost (before tax).
    update public.product_variants set cost_price = v_item.unit_cost where id = v_item.variant_id;
    v_total := v_total + v_qty;
  end loop;

  if v_total = 0 then
    raise exception 'Enter what arrived' using errcode = 'check_violation';
  end if;

  -- Link the stock movements to the purchase order.
  update public.stock_movements
  set reference_type = 'purchase_order', reference_id = v_po.id
  where organization_id = v_po.organization_id and note = v_note and reference_id is null and created_at = now();

  v_status := case when exists (select 1 from public.purchase_order_items
                                where purchase_order_id = v_po.id and received_quantity < quantity)
                   then 'partially_received' else 'received' end;
  update public.purchase_orders
  set status = v_status, received_at = case when v_status = 'received' then now() else received_at end
  where id = v_po.id;

  perform private.log_audit(v_po.organization_id, 'purchase_order.received', 'purchase_order', v_po.id,
    jsonb_build_object('number', v_po.number, 'units', v_total, 'status', v_status));
  return jsonb_build_object('status', v_status, 'received', v_total);
end;
$$;

-- Nothing more will arrive: close a partly received order, or cancel one with no receipts.
create or replace function public.close_purchase_order(p_purchase_order_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po public.purchase_orders;
  v_received boolean;
begin
  v_po := private.authorize_purchase_order(p_purchase_order_id, array['owner', 'admin', 'manager']::public.org_role[]);
  if v_po.status not in ('draft', 'ordered', 'partially_received') then
    raise exception 'This purchase order is already finished' using errcode = 'check_violation';
  end if;
  v_received := exists (select 1 from public.purchase_order_items where purchase_order_id = v_po.id and received_quantity > 0);
  if v_received then
    update public.purchase_orders set status = 'closed', closed_at = now() where id = v_po.id;
  else
    update public.purchase_orders set status = 'cancelled', cancelled_at = now() where id = v_po.id;
  end if;
  perform private.log_audit(v_po.organization_id, case when v_received then 'purchase_order.closed' else 'purchase_order.cancelled' end,
    'purchase_order', v_po.id, jsonb_build_object('number', v_po.number));
  return case when v_received then 'closed' else 'cancelled' end;
end;
$$;

-- -----------------------------------------------------------------------------
-- Low stock: alerts and reorder suggestions
-- -----------------------------------------------------------------------------
create table public.stock_alerts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  variant_id      uuid not null references public.product_variants (id) on delete cascade,
  warehouse_id    uuid not null references public.warehouses (id) on delete cascade,
  available       integer not null,
  reorder_point   integer not null,
  created_at      timestamptz not null default now(),
  notified_at     timestamptz,
  resolved_at     timestamptz
);

create unique index stock_alerts_open_uidx on public.stock_alerts (variant_id, warehouse_id) where resolved_at is null;
create index stock_alerts_pending_idx on public.stock_alerts (organization_id) where resolved_at is null and notified_at is null;

alter table public.stock_alerts enable row level security;
create policy "stock alerts: members read" on public.stock_alerts
  for select to authenticated using (private.is_org_member(organization_id));
revoke all on public.stock_alerts from anon;
revoke insert, update, delete, truncate on public.stock_alerts from authenticated;

create or replace function private.track_stock_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reorder_point > 0 and new.available <= new.reorder_point then
    insert into public.stock_alerts (organization_id, variant_id, warehouse_id, available, reorder_point)
    values (new.organization_id, new.variant_id, new.warehouse_id, new.available, new.reorder_point)
    on conflict (variant_id, warehouse_id) where resolved_at is null
    do update set available = excluded.available, reorder_point = excluded.reorder_point;
  else
    update public.stock_alerts set resolved_at = now()
    where variant_id = new.variant_id and warehouse_id = new.warehouse_id and resolved_at is null;
  end if;
  return null;
end;
$$;

create trigger inventory_levels_stock_alert
  after insert or update of on_hand, reserved, reorder_point on public.inventory_levels
  for each row execute function private.track_stock_alert();

-- Open alerts for stock that already sits at or below its reorder point.
insert into public.stock_alerts (organization_id, variant_id, warehouse_id, available, reorder_point, notified_at)
select organization_id, variant_id, warehouse_id, available, reorder_point, now()
from public.inventory_levels where reorder_point > 0 and available <= reorder_point
on conflict do nothing;

/*
 * What to reorder: open alerts, with a suggested quantity (back up to twice
 * the reorder point, less what's already on order for that warehouse), the
 * last supplier and the last price paid.
 */
create or replace function public.reorder_suggestions(p_organization_id uuid, p_warehouse_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when not private.is_org_member(p_organization_id) then '[]'::jsonb else coalesce(jsonb_agg(x order by x ->> 'product_title', x ->> 'sku'), '[]'::jsonb) end
  from (
    select jsonb_build_object(
      'variant_id', v.id, 'sku', v.sku, 'variant_title', v.title, 'product_title', p.title,
      'warehouse_id', l.warehouse_id, 'warehouse_name', w.name,
      'available', l.available, 'reorder_point', l.reorder_point,
      'on_order', coalesce(oo.qty, 0),
      'suggested', greatest(l.reorder_point * 2 - l.available - coalesce(oo.qty, 0), 0),
      'unit_cost', coalesce(last.unit_cost, v.cost_price),
      'tax_rate', coalesce(last.tax_rate, p.gst_rate, c.gst_rate, 0),
      'supplier_id', last.supplier_id, 'supplier_name', last.supplier_name
    ) as x
    from public.inventory_levels l
    join public.product_variants v on v.id = l.variant_id and v.is_active
    join public.products p on p.id = v.product_id and p.status <> 'archived'
    left join public.categories c on c.id = p.category_id
    join public.warehouses w on w.id = l.warehouse_id
    left join lateral (
      select sum(i.quantity - i.received_quantity)::int as qty
      from public.purchase_order_items i join public.purchase_orders po on po.id = i.purchase_order_id
      where i.variant_id = l.variant_id and po.warehouse_id = l.warehouse_id
        and po.status in ('draft', 'ordered', 'partially_received')
    ) oo on true
    left join lateral (
      select i.unit_cost, i.tax_rate, po.supplier_id, s.name as supplier_name
      from public.purchase_order_items i
      join public.purchase_orders po on po.id = i.purchase_order_id and po.status <> 'cancelled'
      join public.suppliers s on s.id = po.supplier_id
      where i.variant_id = l.variant_id
      order by po.created_at desc limit 1
    ) last on true
    where l.organization_id = p_organization_id
      and l.reorder_point > 0 and l.available <= l.reorder_point
      and (p_warehouse_id is null or l.warehouse_id = p_warehouse_id)
  ) t;
$$;

-- -----------------------------------------------------------------------------
-- Settings: alerts, daily digest and courier
-- -----------------------------------------------------------------------------
create table public.operations_settings (
  organization_id  uuid primary key references public.organizations (id) on delete cascade,
  low_stock_alerts boolean not null default true,
  daily_digest     boolean not null default true,
  -- Hour of the day (India time) the digest goes out.
  digest_hour      smallint not null default 8 check (digest_hour between 0 and 23),
  recipient_roles  public.org_role[] not null default array['owner', 'admin', 'manager']::public.org_role[]
                   check (cardinality(recipient_roles) between 1 and 5),
  courier          text check (courier is null or courier in ('test')),
  last_digest_on   date,
  updated_by       uuid references auth.users (id) on delete set null,
  updated_at       timestamptz not null default now()
);

alter table public.operations_settings enable row level security;
revoke all on public.operations_settings from anon, authenticated;

create or replace function public.get_operations_settings(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when not private.is_org_member(p_organization_id) then null else
    jsonb_build_object(
      'low_stock_alerts', coalesce(s.low_stock_alerts, true),
      'daily_digest', coalesce(s.daily_digest, true),
      'digest_hour', coalesce(s.digest_hour, 8),
      'recipient_roles', coalesce(to_jsonb(s.recipient_roles), '["owner","admin","manager"]'::jsonb),
      'courier', s.courier,
      'last_digest_on', s.last_digest_on)
  end
  from (select 1) one
  left join public.operations_settings s on s.organization_id = p_organization_id;
$$;

create or replace function public.save_operations_settings(
  p_organization_id  uuid,
  p_low_stock_alerts boolean,
  p_daily_digest     boolean,
  p_digest_hour      integer,
  p_recipient_roles  public.org_role[],
  p_courier          text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_org_role(p_organization_id, array['owner', 'admin']::public.org_role[]) then
    raise exception 'Only owners and admins can change these settings' using errcode = '42501';
  end if;
  if p_recipient_roles is null or cardinality(p_recipient_roles) = 0 then
    raise exception 'Choose who gets the emails' using errcode = 'check_violation';
  end if;
  insert into public.operations_settings (organization_id, low_stock_alerts, daily_digest, digest_hour, recipient_roles, courier, updated_by)
  values (p_organization_id, p_low_stock_alerts, p_daily_digest, p_digest_hour, p_recipient_roles, nullif(p_courier, ''), auth.uid())
  on conflict (organization_id) do update
    set low_stock_alerts = excluded.low_stock_alerts, daily_digest = excluded.daily_digest,
        digest_hour = excluded.digest_hour, recipient_roles = excluded.recipient_roles,
        courier = excluded.courier, updated_by = excluded.updated_by, updated_at = now();
  perform private.log_audit(p_organization_id, 'operations.updated', 'operations_settings', p_organization_id,
    jsonb_build_object('low_stock_alerts', p_low_stock_alerts, 'daily_digest', p_daily_digest,
                       'digest_hour', p_digest_hour, 'courier', p_courier));
end;
$$;

-- Service role: who gets operations emails for a business.
create or replace function public.operations_contacts(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', o.name, 'slug', o.slug,
    'emails', coalesce((
      select jsonb_agg(distinct u.email::text)
      from public.organization_members m join auth.users u on u.id = m.user_id
      where m.organization_id = o.id and u.email is not null
        and m.role = any (coalesce(s.recipient_roles, array['owner', 'admin', 'manager']::public.org_role[]))), '[]'::jsonb))
  from public.organizations o
  left join public.operations_settings s on s.organization_id = o.id
  where o.id = p_organization_id;
$$;

/*
 * Service role: take the low-stock alerts not emailed yet, per business with
 * alerts on (alerts of businesses with them off are marked as handled).
 */
create or replace function public.claim_stock_alerts()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  update public.stock_alerts a set notified_at = now()
  from public.operations_settings s
  where s.organization_id = a.organization_id and not s.low_stock_alerts
    and a.notified_at is null and a.resolved_at is null;

  with claimed as (
    update public.stock_alerts a set notified_at = now()
    where a.notified_at is null and a.resolved_at is null
    returning a.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('organization_id', g.organization_id, 'items', g.items)), '[]'::jsonb)
  into v_result
  from (
    select c.organization_id,
           jsonb_agg(jsonb_build_object('alert_id', c.id, 'product_title', p.title, 'variant_title', v.title, 'sku', v.sku,
                                        'warehouse_name', w.name, 'available', l.available, 'reorder_point', l.reorder_point)
                     order by p.title, v.sku) as items
    from claimed c
    join public.product_variants v on v.id = c.variant_id
    join public.products p on p.id = v.product_id
    join public.warehouses w on w.id = c.warehouse_id
    join public.inventory_levels l on l.variant_id = c.variant_id and l.warehouse_id = c.warehouse_id
    group by c.organization_id
  ) g;
  return v_result;
end;
$$;

-- Service role: put alerts back when their email couldn't be sent.
create or replace function public.release_stock_alerts(p_alert_ids uuid[])
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.stock_alerts set notified_at = null where id = any (p_alert_ids) and resolved_at is null;
$$;

/*
 * Service role: businesses whose daily digest is due (their hour has come in
 * India and it hasn't gone out today). Marks them as sent for today.
 */
create or replace function public.claim_due_digests(p_now timestamptz default now())
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_local timestamp := p_now at time zone 'Asia/Kolkata';
  v_ids   jsonb;
begin
  insert into public.operations_settings (organization_id)
  select o.id from public.organizations o
  where not exists (select 1 from public.operations_settings s where s.organization_id = o.id)
  on conflict do nothing;

  with due as (
    update public.operations_settings s
    set last_digest_on = v_local::date
    where s.daily_digest
      and extract(hour from v_local) >= s.digest_hour
      and (s.last_digest_on is null or s.last_digest_on < v_local::date)
    returning s.organization_id
  )
  select coalesce(jsonb_agg(organization_id), '[]'::jsonb) into v_ids from due;
  return v_ids;
end;
$$;

create or replace function public.release_digest(p_organization_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.operations_settings set last_digest_on = null where organization_id = p_organization_id;
$$;

/*
 * The daily digest: yesterday's sales (India time) and what needs attention
 * today. Members can preview it; the service role sends it.
 */
create or replace function private.digest_data(p_organization_id uuid, p_now timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (p_now at time zone 'Asia/Kolkata')::date;
  v_from  timestamptz := ((v_today - 1)::timestamp at time zone 'Asia/Kolkata');
  v_to    timestamptz := (v_today::timestamp at time zone 'Asia/Kolkata');
begin
  return jsonb_build_object(
    'day', v_today - 1,
    'sales', (select jsonb_build_object('orders', count(*), 'total', coalesce(sum(grand_total), 0))
              from public.orders where organization_id = p_organization_id and status <> 'cancelled'
                and placed_at >= v_from and placed_at < v_to),
    'to_confirm', (select count(*) from public.orders where organization_id = p_organization_id and status = 'pending'
                     and (payment_due_at is null or payment_status = 'paid')),
    'to_pack', (select count(*) from public.orders where organization_id = p_organization_id and status = 'confirmed'
                  and fulfillment_status in ('unfulfilled', 'partially_fulfilled')),
    'out_for_delivery', (select count(*) from public.shipments where organization_id = p_organization_id and status = 'out_for_delivery'),
    'failed_attempts', (select count(*) from public.shipments where organization_id = p_organization_id and status = 'failed_attempt'),
    'returns_to_review', (select count(*) from public.returns where organization_id = p_organization_id and status = 'requested'),
    'low_stock', (select jsonb_build_object(
                    'count', count(*),
                    'items', coalesce(jsonb_agg(jsonb_build_object('product_title', x.product_title, 'variant_title', x.variant_title,
                                                                   'sku', x.sku, 'warehouse_name', x.warehouse_name, 'available', x.available,
                                                                   'reorder_point', x.reorder_point)) filter (where x.rn <= 15), '[]'::jsonb))
                  from (select p.title as product_title, v.title as variant_title, v.sku, w.name as warehouse_name,
                               l.available, l.reorder_point, row_number() over (order by l.available - l.reorder_point, p.title) as rn
                        from public.stock_alerts a
                        join public.inventory_levels l on l.variant_id = a.variant_id and l.warehouse_id = a.warehouse_id
                        join public.product_variants v on v.id = a.variant_id and v.is_active
                        join public.products p on p.id = v.product_id and p.status <> 'archived'
                        join public.warehouses w on w.id = a.warehouse_id
                        where a.organization_id = p_organization_id and a.resolved_at is null) x),
    'purchase_orders', (select jsonb_build_object(
                          'due_today', count(*) filter (where expected_at = v_today),
                          'overdue', count(*) filter (where expected_at < v_today))
                        from public.purchase_orders where organization_id = p_organization_id
                          and status in ('ordered', 'partially_received')));
end;
$$;

-- Members preview the digest; the service role builds it for email.
create or replace function public.operations_digest(p_organization_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'Not a member of this business' using errcode = '42501';
  end if;
  return private.digest_data(p_organization_id, p_now);
end;
$$;

create or replace function public.service_operations_digest(p_organization_id uuid, p_now timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.digest_data(p_organization_id, p_now);
$$;

-- -----------------------------------------------------------------------------
-- Couriers
-- -----------------------------------------------------------------------------
alter table public.shipments
  add column courier          text check (courier is null or courier in ('test')),
  add column courier_service  text check (courier_service is null or char_length(courier_service) <= 40),
  add column shipping_cost    numeric(12, 2) check (shipping_cost is null or shipping_cost >= 0),
  add column cod_amount       numeric(12, 2) check (cod_amount is null or cod_amount >= 0),
  -- { weight_grams, length_cm, breadth_cm, height_cm }
  add column package          jsonb,
  add column booked_at        timestamptz;

grant select (courier, courier_service, shipping_cost, cod_amount, package, booked_at) on public.shipments to authenticated;

create unique index shipments_courier_awb_uidx on public.shipments (courier, tracking_number) where courier is not null;

alter table public.shipment_events add column external_id text;
create unique index shipment_events_external_uidx on public.shipment_events (shipment_id, external_id) where external_id is not null;

-- Staff: record a booking the server made with the courier.
create or replace function public.record_courier_booking(
  p_shipment_id     uuid,
  p_courier         text,
  p_carrier_name    text,
  p_service         text,
  p_awb             text,
  p_cost            numeric,
  p_estimated       timestamptz,
  p_package         jsonb,
  p_cod_amount      numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ship public.shipments;
begin
  select * into v_ship from public.shipments where id = p_shipment_id for update;
  if v_ship.id is null then
    raise exception 'Shipment not found' using errcode = 'no_data_found';
  end if;
  perform private.authorize_order(v_ship.order_id, array['owner', 'admin', 'manager', 'staff']::public.org_role[]);
  if v_ship.status <> 'packed' then
    raise exception 'Only packed parcels can be booked with a courier' using errcode = 'check_violation';
  end if;
  if v_ship.courier is not null then
    raise exception 'This parcel is already booked' using errcode = 'check_violation';
  end if;
  if p_awb is null or p_awb !~ '^[A-Za-z0-9-]{6,40}$' then
    raise exception 'The courier returned an invalid AWB' using errcode = 'check_violation';
  end if;
  update public.shipments
  set courier = p_courier, carrier = left(p_carrier_name, 60), courier_service = p_service,
      tracking_number = p_awb, shipping_cost = p_cost, estimated_delivery = p_estimated,
      package = p_package, cod_amount = nullif(p_cod_amount, 0), booked_at = now()
  where id = p_shipment_id;
  perform private.add_order_event(v_ship.organization_id, v_ship.order_id, 'shipment.booked',
    'Shipment ' || v_ship.number || ' booked with ' || p_carrier_name || ' (AWB ' || p_awb || ')',
    jsonb_build_object('shipment_id', p_shipment_id, 'awb', p_awb, 'cost', p_cost));
end;
$$;

-- Staff: drop a booking before pickup (the server cancels it with the courier first).
create or replace function public.clear_courier_booking(p_shipment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ship public.shipments;
begin
  select * into v_ship from public.shipments where id = p_shipment_id for update;
  if v_ship.id is null then
    raise exception 'Shipment not found' using errcode = 'no_data_found';
  end if;
  perform private.authorize_order(v_ship.order_id, array['owner', 'admin', 'manager', 'staff']::public.org_role[]);
  if v_ship.status <> 'packed' or v_ship.courier is null then
    raise exception 'Only bookings not yet picked up can be cancelled' using errcode = 'check_violation';
  end if;
  update public.shipments
  set courier = null, carrier = null, courier_service = null, tracking_number = null, shipping_cost = null,
      estimated_delivery = null, package = null, cod_amount = null, booked_at = null
  where id = p_shipment_id;
  perform private.add_order_event(v_ship.organization_id, v_ship.order_id, 'shipment.booking_cancelled',
    'Courier booking for ' || v_ship.number || ' cancelled (AWB ' || v_ship.tracking_number || ')',
    jsonb_build_object('shipment_id', p_shipment_id));
end;
$$;

/*
 * Service role: a tracking update from a courier. Idempotent on the event id;
 * updates that don't move the parcel forward are recorded as history only.
 * The courier's proof of delivery counts as delivered (no Shopverse OTP).
 * Returns { applied, shipment_id, order_id, status, previous }.
 */
create or replace function public.courier_shipment_update(
  p_courier     text,
  p_awb         text,
  p_status      public.shipment_status,
  p_event_id    text,
  p_description text default null,
  p_location    text default null,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ship    public.shipments;
  v_allowed public.shipment_status[];
  v_applied boolean;
begin
  select * into v_ship from public.shipments where courier = p_courier and tracking_number = p_awb for update;
  if v_ship.id is null then
    return jsonb_build_object('applied', false, 'reason', 'unknown shipment');
  end if;
  if exists (select 1 from public.shipment_events where shipment_id = v_ship.id and external_id = p_event_id) then
    return jsonb_build_object('applied', false, 'reason', 'duplicate', 'shipment_id', v_ship.id);
  end if;

  v_allowed := case v_ship.status
    when 'packed'           then array['picked_up', 'in_transit', 'out_for_delivery', 'delivered']
    when 'picked_up'        then array['in_transit', 'out_for_delivery', 'delivered', 'failed_attempt', 'returned_to_origin']
    when 'in_transit'       then array['out_for_delivery', 'delivered', 'failed_attempt', 'returned_to_origin']
    when 'out_for_delivery' then array['delivered', 'failed_attempt', 'returned_to_origin']
    when 'failed_attempt'   then array['in_transit', 'out_for_delivery', 'delivered', 'returned_to_origin']
    else array[]::text[]
  end::public.shipment_status[];
  v_applied := p_status = any (v_allowed);

  if v_applied then
    update public.shipments
    set status = p_status,
        shipped_at = case when shipped_at is null and p_status <> 'packed' then p_occurred_at else shipped_at end,
        delivered_at = case when p_status = 'delivered' then p_occurred_at else delivered_at end,
        returned_at = case when p_status = 'returned_to_origin' then p_occurred_at else returned_at end,
        delivery_attempts = delivery_attempts + case when p_status = 'out_for_delivery' then 1 else 0 end,
        delivery_otp_hash = null, otp_expires_at = null
    where id = v_ship.id;
  end if;

  insert into public.shipment_events (organization_id, shipment_id, status, description, location, occurred_at, external_id)
  values (v_ship.organization_id, v_ship.id, p_status,
          coalesce(nullif(btrim(p_description), ''), initcap(replace(p_status::text, '_', ' '))),
          nullif(btrim(p_location), ''), p_occurred_at, p_event_id);

  if v_applied then
    perform private.add_order_event(v_ship.organization_id, v_ship.order_id, 'shipment.' || p_status::text,
      'Shipment ' || v_ship.number || ': ' || replace(p_status::text, '_', ' ') || ' (courier update)',
      jsonb_build_object('shipment_id', v_ship.id));
    if p_status = 'returned_to_origin' then
      perform private.restock_shipment(v_ship, false, 'Shipment ' || v_ship.number || ' returned to origin');
    end if;
    if p_status in ('delivered', 'returned_to_origin') then
      perform private.refresh_order_fulfilment(v_ship.order_id);
    end if;
  end if;

  return jsonb_build_object('applied', v_applied, 'shipment_id', v_ship.id, 'order_id', v_ship.order_id,
                            'status', p_status, 'previous', v_ship.status);
end;
$$;

-- Everything a packing slip or shipping label needs.
create or replace function public.shipment_document(p_shipment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ship public.shipments;
begin
  select * into v_ship from public.shipments where id = p_shipment_id;
  if v_ship.id is null or not private.is_org_member(v_ship.organization_id) then
    return null;
  end if;
  return (
    select jsonb_build_object(
      'shipment', jsonb_build_object('id', v_ship.id, 'number', v_ship.number, 'status', v_ship.status,
        'carrier', v_ship.carrier, 'courier', v_ship.courier, 'service', v_ship.courier_service,
        'awb', v_ship.tracking_number, 'package', v_ship.package, 'cod_amount', v_ship.cod_amount,
        'created_at', v_ship.created_at, 'booked_at', v_ship.booked_at),
      'order', jsonb_build_object('id', o.id, 'number', o.number, 'placed_at', o.placed_at,
        'payment_method', o.payment_method, 'payment_status', o.payment_status, 'grand_total', o.grand_total,
        'currency', o.currency, 'note', o.notes, 'shipping_address', o.shipping_address),
      'shop', jsonb_build_object('name', sh.name, 'legal_name', sh.settings ->> 'legal_name',
        'phone', sh.settings ->> 'support_phone', 'email', sh.settings ->> 'support_email', 'gstin', sh.settings ->> 'gstin'),
      'warehouse', jsonb_build_object('name', w.name, 'code', w.code, 'address', w.address),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'title', oi.title, 'sku', oi.sku, 'quantity', si.quantity,
          'serials', to_jsonb(si.serial_numbers),
          'batches', coalesce((select jsonb_agg(b ->> 'batch_code') from jsonb_array_elements(si.batches) b), '[]'::jsonb))
          order by oi.title)
        from public.shipment_items si join public.order_items oi on oi.id = si.order_item_id
        where si.shipment_id = v_ship.id), '[]'::jsonb))
    from public.orders o
    join public.shops sh on sh.id = o.shop_id
    join public.warehouses w on w.id = v_ship.warehouse_id
    where o.id = v_ship.order_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function public.save_purchase_order(uuid, uuid, uuid, uuid, jsonb, date, text, text) from public, anon;
revoke all on function public.place_purchase_order(uuid) from public, anon;
revoke all on function public.receive_purchase_order(uuid, jsonb) from public, anon;
revoke all on function public.close_purchase_order(uuid) from public, anon;
revoke all on function public.reorder_suggestions(uuid, uuid) from public, anon;
revoke all on function public.get_operations_settings(uuid) from public, anon;
revoke all on function public.save_operations_settings(uuid, boolean, boolean, integer, public.org_role[], text) from public, anon;
revoke all on function public.record_courier_booking(uuid, text, text, text, text, numeric, timestamptz, jsonb, numeric) from public, anon;
revoke all on function public.clear_courier_booking(uuid) from public, anon;
revoke all on function public.shipment_document(uuid) from public, anon;
revoke all on function public.operations_digest(uuid, timestamptz) from public, anon;
grant execute on function public.save_purchase_order(uuid, uuid, uuid, uuid, jsonb, date, text, text) to authenticated;
grant execute on function public.place_purchase_order(uuid) to authenticated;
grant execute on function public.receive_purchase_order(uuid, jsonb) to authenticated;
grant execute on function public.close_purchase_order(uuid) to authenticated;
grant execute on function public.reorder_suggestions(uuid, uuid) to authenticated;
grant execute on function public.get_operations_settings(uuid) to authenticated;
grant execute on function public.save_operations_settings(uuid, boolean, boolean, integer, public.org_role[], text) to authenticated;
grant execute on function public.record_courier_booking(uuid, text, text, text, text, numeric, timestamptz, jsonb, numeric) to authenticated;
grant execute on function public.clear_courier_booking(uuid) to authenticated;
grant execute on function public.shipment_document(uuid) to authenticated;
grant execute on function public.operations_digest(uuid, timestamptz) to authenticated;
revoke all on function public.service_operations_digest(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.service_operations_digest(uuid, timestamptz) to service_role;

revoke all on function public.operations_contacts(uuid) from public, anon, authenticated;
revoke all on function public.claim_stock_alerts() from public, anon, authenticated;
revoke all on function public.release_stock_alerts(uuid[]) from public, anon, authenticated;
revoke all on function public.claim_due_digests(timestamptz) from public, anon, authenticated;
revoke all on function public.release_digest(uuid) from public, anon, authenticated;
revoke all on function public.courier_shipment_update(text, text, public.shipment_status, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.operations_contacts(uuid) to service_role;
grant execute on function public.claim_stock_alerts() to service_role;
grant execute on function public.release_stock_alerts(uuid[]) to service_role;
grant execute on function public.claim_due_digests(timestamptz) to service_role;
grant execute on function public.release_digest(uuid) to service_role;
grant execute on function public.courier_shipment_update(text, text, public.shipment_status, text, text, text, timestamptz) to service_role;
