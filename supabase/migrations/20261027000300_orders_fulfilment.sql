-- =============================================================================
-- Tradeloom · Migration 003 · Customers, orders & fulfilment
-- =============================================================================

create type public.order_status as enum ('pending', 'confirmed', 'cancelled', 'completed');
create type public.payment_status as enum ('pending', 'authorized', 'paid', 'partially_refunded', 'refunded', 'failed');
create type public.payment_method as enum ('upi', 'card', 'netbanking', 'wallet', 'cod', 'store_credit');
create type public.fulfillment_status as enum ('unfulfilled', 'partially_fulfilled', 'fulfilled', 'returned');
create type public.shipment_status as enum (
  'pending', 'packed', 'picked_up', 'in_transit', 'out_for_delivery',
  'delivered', 'failed_attempt', 'returned_to_origin', 'cancelled'
);

-- -----------------------------------------------------------------------------
-- Per-organization counters (gap-free, human-friendly order numbers)
-- -----------------------------------------------------------------------------
create table private.counters (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  value           bigint not null default 0,
  primary key (organization_id, name)
);

create or replace function private.next_counter(p_organization_id uuid, p_name text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into private.counters (organization_id, name, value)
  values (p_organization_id, p_name, 1)
  on conflict (organization_id, name) do update set value = private.counters.value + 1
  returning value;
$$;

-- -----------------------------------------------------------------------------
-- Customers
-- -----------------------------------------------------------------------------
create table public.customers (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  email             extensions.citext,
  phone             text check (phone is null or phone ~ '^\+?[0-9]{8,15}$'),
  full_name         text,
  email_verified_at timestamptz,
  accepts_marketing boolean not null default false,
  tags              text[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint customers_contact_required check (email is not null or phone is not null),
  unique (organization_id, id)
);

create unique index customers_org_email_uidx on public.customers (organization_id, email) where email is not null;
create unique index customers_org_phone_uidx on public.customers (organization_id, phone) where phone is not null;

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Orders
-- -----------------------------------------------------------------------------
create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null,
  shop_id             uuid not null,
  customer_id         uuid,
  number              text not null,
  status              public.order_status not null default 'pending',
  payment_status      public.payment_status not null default 'pending',
  payment_method      public.payment_method,
  fulfillment_status  public.fulfillment_status not null default 'unfulfilled',
  currency            char(3) not null default 'INR',
  subtotal            numeric(12, 2) not null default 0 check (subtotal >= 0),
  discount_total      numeric(12, 2) not null default 0 check (discount_total >= 0),
  shipping_total      numeric(12, 2) not null default 0 check (shipping_total >= 0),
  tax_total           numeric(12, 2) not null default 0 check (tax_total >= 0),
  grand_total         numeric(12, 2) not null default 0 check (grand_total >= 0),
  shipping_address    jsonb not null default '{}'::jsonb,
  notes               text,
  placed_at           timestamptz not null default now(),
  cancelled_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, number),
  unique (organization_id, id),
  foreign key (organization_id, shop_id) references public.shops (organization_id, id) on delete restrict,
  foreign key (organization_id, customer_id) references public.customers (organization_id, id) on delete set null (customer_id)
);

create index orders_shop_placed_idx on public.orders (shop_id, placed_at desc);
create index orders_org_status_idx on public.orders (organization_id, status, placed_at desc);
create index orders_customer_idx on public.orders (customer_id);

create or replace function private.assign_order_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text;
begin
  if new.number is null or new.number = '' then
    select order_prefix into v_prefix from public.shops where id = new.shop_id;
    new.number := coalesce(v_prefix, 'ORD') || '-' ||
      lpad(private.next_counter(new.organization_id, 'order')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger orders_assign_number
  before insert on public.orders
  for each row execute function private.assign_order_number();

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function private.set_updated_at();

create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  order_id         uuid not null,
  variant_id       uuid,
  title            text not null,
  sku              text not null,
  quantity         integer not null check (quantity > 0),
  unit_price       numeric(12, 2) not null check (unit_price >= 0),
  total            numeric(12, 2) generated always as (quantity * unit_price) stored,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, order_id) references public.orders (organization_id, id) on delete cascade,
  foreign key (organization_id, variant_id) references public.product_variants (organization_id, id) on delete set null (variant_id)
);

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_variant_id_idx on public.order_items (variant_id);

-- -----------------------------------------------------------------------------
-- Shipments & tracking events
-- -----------------------------------------------------------------------------
create table public.shipments (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null,
  order_id           uuid not null,
  warehouse_id       uuid not null,
  status             public.shipment_status not null default 'pending',
  carrier            text,
  tracking_number    text,
  -- The delivery OTP is never stored in plain text; only a salted hash.
  delivery_otp_hash  text,
  estimated_delivery timestamptz,
  shipped_at         timestamptz,
  delivered_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, order_id) references public.orders (organization_id, id) on delete cascade,
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id) on delete restrict
);

create index shipments_order_id_idx on public.shipments (order_id);
create index shipments_org_status_idx on public.shipments (organization_id, status);
create unique index shipments_carrier_tracking_uidx
  on public.shipments (carrier, tracking_number)
  where tracking_number is not null;

create trigger shipments_set_updated_at
  before update on public.shipments
  for each row execute function private.set_updated_at();

create table public.shipment_events (
  id               bigint generated always as identity primary key,
  organization_id  uuid not null,
  shipment_id      uuid not null,
  status           public.shipment_status not null,
  description      text,
  location         text,
  occurred_at      timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  foreign key (organization_id, shipment_id) references public.shipments (organization_id, id) on delete cascade
);

create index shipment_events_shipment_idx on public.shipment_events (shipment_id, occurred_at desc);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.customers        enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.shipments        enable row level security;
alter table public.shipment_events  enable row level security;

create policy "customers: members read" on public.customers
  for select to authenticated using (private.is_org_member(organization_id));
create policy "customers: staff write" on public.customers
  for all to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager', 'staff', 'support']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['owner', 'admin', 'manager', 'staff', 'support']::public.org_role[]));

create policy "orders: read with shop access" on public.orders
  for select to authenticated using (private.can_access_shop(organization_id, shop_id));
create policy "orders: staff create" on public.orders
  for insert to authenticated
  with check (
    private.can_access_shop(organization_id, shop_id)
    and private.has_org_role(organization_id, array['owner', 'admin', 'manager', 'staff']::public.org_role[])
  );
create policy "orders: staff update" on public.orders
  for update to authenticated
  using (
    private.can_access_shop(organization_id, shop_id)
    and private.has_org_role(organization_id, array['owner', 'admin', 'manager', 'staff', 'support']::public.org_role[])
  )
  with check (private.can_access_shop(organization_id, shop_id));

create policy "order items: read with order access" on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and private.can_access_shop(o.organization_id, o.shop_id)));
create policy "order items: staff write" on public.order_items
  for all to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager', 'staff']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['owner', 'admin', 'manager', 'staff']::public.org_role[]));

create policy "shipments: read with order access" on public.shipments
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and private.can_access_shop(o.organization_id, o.shop_id)));
create policy "shipments: staff write" on public.shipments
  for all to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager', 'staff']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['owner', 'admin', 'manager', 'staff']::public.org_role[]));

-- Clients must never read the OTP hash.
revoke select on public.shipments from authenticated;
grant select (
  id, organization_id, order_id, warehouse_id, status, carrier, tracking_number,
  estimated_delivery, shipped_at, delivered_at, created_at, updated_at
) on public.shipments to authenticated;

create policy "shipment events: read with shipment access" on public.shipment_events
  for select to authenticated
  using (exists (
    select 1 from public.shipments s
    join public.orders o on o.id = s.order_id
    where s.id = shipment_id and private.can_access_shop(o.organization_id, o.shop_id)
  ));
create policy "shipment events: staff write" on public.shipment_events
  for insert to authenticated
  with check (private.has_org_role(organization_id, array['owner', 'admin', 'manager', 'staff']::public.org_role[]));
