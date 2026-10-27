-- =============================================================================
-- Tradeloom · Migration 002 · Catalog & inventory
-- Products are organization-wide and published per shop. Stock is held per
-- variant per warehouse; every change goes through public.adjust_stock(),
-- which writes an append-only ledger entry in the same transaction.
-- =============================================================================

create type public.product_status as enum ('draft', 'active', 'archived');
create type public.stock_movement_type as enum (
  'receipt',        -- goods received (purchase order, initial stock)
  'adjustment',     -- manual correction / stock count
  'sale',           -- shipped to a customer
  'return',         -- customer return restocked
  'transfer_out',
  'transfer_in',
  'damage'
);

-- -----------------------------------------------------------------------------
-- Products & variants
-- -----------------------------------------------------------------------------
create table public.products (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  title            text not null check (char_length(title) between 2 and 160),
  slug             text not null check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$'),
  description      text,
  status           public.product_status not null default 'draft',
  brand            text,
  category         text,
  tags             text[] not null default '{}',
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, slug),
  unique (organization_id, id)
);

create index products_organization_status_idx on public.products (organization_id, status);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function private.set_updated_at();

create table public.product_variants (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null,
  product_id        uuid not null,
  sku               text not null check (sku ~ '^[A-Za-z0-9._-]{2,64}$'),
  title             text not null default 'Default',
  options           jsonb not null default '{}'::jsonb,
  price             numeric(12, 2) not null check (price >= 0),
  compare_at_price  numeric(12, 2) check (compare_at_price is null or compare_at_price >= 0),
  cost_price        numeric(12, 2) check (cost_price is null or cost_price >= 0),
  barcode           text,
  weight_grams      integer check (weight_grams is null or weight_grams >= 0),
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, sku),
  unique (organization_id, id),
  foreign key (organization_id, product_id) references public.products (organization_id, id) on delete cascade
);

create index product_variants_product_id_idx on public.product_variants (product_id);

create trigger product_variants_set_updated_at
  before update on public.product_variants
  for each row execute function private.set_updated_at();

-- Publishing a product to a shop, with an optional shop-specific price.
create table public.shop_products (
  organization_id  uuid not null,
  shop_id          uuid not null,
  product_id       uuid not null,
  is_published     boolean not null default false,
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  primary key (shop_id, product_id),
  foreign key (organization_id, shop_id) references public.shops (organization_id, id) on delete cascade,
  foreign key (organization_id, product_id) references public.products (organization_id, id) on delete cascade
);

create index shop_products_product_id_idx on public.shop_products (product_id);

-- -----------------------------------------------------------------------------
-- Inventory
-- -----------------------------------------------------------------------------
create table public.inventory_levels (
  organization_id  uuid not null,
  variant_id       uuid not null,
  warehouse_id     uuid not null,
  on_hand          integer not null default 0 check (on_hand >= 0),
  reserved         integer not null default 0 check (reserved >= 0),
  available        integer generated always as (on_hand - reserved) stored,
  reorder_point    integer not null default 0 check (reorder_point >= 0),
  updated_at       timestamptz not null default now(),
  primary key (variant_id, warehouse_id),
  constraint inventory_reserved_le_on_hand check (reserved <= on_hand),
  foreign key (organization_id, variant_id) references public.product_variants (organization_id, id) on delete cascade,
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id) on delete cascade
);

create index inventory_levels_warehouse_idx on public.inventory_levels (warehouse_id);
create index inventory_levels_low_stock_idx
  on public.inventory_levels (organization_id)
  where on_hand - reserved <= reorder_point;

create table public.stock_movements (
  id               bigint generated always as identity primary key,
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  variant_id       uuid not null,
  warehouse_id     uuid not null,
  type             public.stock_movement_type not null,
  quantity         integer not null check (quantity <> 0),
  balance_after    integer not null check (balance_after >= 0),
  reference_type   text,
  reference_id     uuid,
  note             text check (note is null or char_length(note) <= 500),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, variant_id) references public.product_variants (organization_id, id) on delete cascade,
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id) on delete cascade
);

create index stock_movements_variant_created_idx
  on public.stock_movements (variant_id, created_at desc);
create index stock_movements_org_created_idx
  on public.stock_movements (organization_id, created_at desc);

-- -----------------------------------------------------------------------------
-- adjust_stock: the only write path for on-hand quantities.
-- Locks the level row, enforces non-negative stock and records the movement.
-- -----------------------------------------------------------------------------
create or replace function public.adjust_stock(
  p_variant_id     uuid,
  p_warehouse_id   uuid,
  p_quantity       integer,
  p_type           public.stock_movement_type,
  p_note           text default null,
  p_reference_type text default null,
  p_reference_id   uuid default null
)
returns public.inventory_levels
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_level  public.inventory_levels;
begin
  if p_quantity is null or p_quantity = 0 then
    raise exception 'Quantity must be non-zero' using errcode = 'check_violation';
  end if;

  select v.organization_id into v_org_id
  from public.product_variants v
  join public.warehouses w
    on w.id = p_warehouse_id and w.organization_id = v.organization_id
  where v.id = p_variant_id;

  if v_org_id is null then
    raise exception 'Variant or warehouse not found' using errcode = 'no_data_found';
  end if;

  if not private.has_org_role(v_org_id, array['owner', 'admin', 'manager', 'staff']::public.org_role[]) then
    raise exception 'Not allowed to adjust stock' using errcode = '42501';
  end if;

  insert into public.inventory_levels (organization_id, variant_id, warehouse_id)
  values (v_org_id, p_variant_id, p_warehouse_id)
  on conflict (variant_id, warehouse_id) do nothing;

  select * into v_level
  from public.inventory_levels
  where variant_id = p_variant_id and warehouse_id = p_warehouse_id
  for update;

  if v_level.on_hand + p_quantity < v_level.reserved then
    raise exception 'Insufficient stock: % on hand, % reserved, change %',
      v_level.on_hand, v_level.reserved, p_quantity
      using errcode = 'check_violation';
  end if;

  update public.inventory_levels
  set on_hand = on_hand + p_quantity,
      updated_at = now()
  where variant_id = p_variant_id and warehouse_id = p_warehouse_id
  returning * into v_level;

  insert into public.stock_movements (
    organization_id, variant_id, warehouse_id, type, quantity, balance_after,
    reference_type, reference_id, note, created_by
  ) values (
    v_org_id, p_variant_id, p_warehouse_id, p_type, p_quantity, v_level.on_hand,
    p_reference_type, p_reference_id, p_note, auth.uid()
  );

  return v_level;
end;
$$;

revoke all on function public.adjust_stock(uuid, uuid, integer, public.stock_movement_type, text, text, uuid) from public, anon;
grant execute on function public.adjust_stock(uuid, uuid, integer, public.stock_movement_type, text, text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.products          enable row level security;
alter table public.product_variants  enable row level security;
alter table public.shop_products     enable row level security;
alter table public.inventory_levels  enable row level security;
alter table public.stock_movements   enable row level security;

create policy "products: members read" on public.products
  for select to authenticated using (private.is_org_member(organization_id));
create policy "products: managers write" on public.products
  for all to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]));

create policy "variants: members read" on public.product_variants
  for select to authenticated using (private.is_org_member(organization_id));
create policy "variants: managers write" on public.product_variants
  for all to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]));

create policy "shop products: read with shop access" on public.shop_products
  for select to authenticated using (private.can_access_shop(organization_id, shop_id));
create policy "shop products: managers write" on public.shop_products
  for all to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]));

-- Inventory tables are read-only to clients; writes go through adjust_stock().
create policy "inventory: members read" on public.inventory_levels
  for select to authenticated using (private.is_org_member(organization_id));
create policy "inventory: managers set reorder point" on public.inventory_levels
  for update to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]));

-- Column-level guard: clients may only change reorder_point directly.
revoke update on public.inventory_levels from authenticated;
grant update (reorder_point) on public.inventory_levels to authenticated;

create policy "stock movements: members read" on public.stock_movements
  for select to authenticated using (private.is_org_member(organization_id));
