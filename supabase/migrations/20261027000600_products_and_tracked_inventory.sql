-- =============================================================================
-- Shopverse · Migration 006 · Products & tracked inventory
--  * attribute values on products/variants are validated against the
--    category's attribute definitions (in the database, not just the UI)
--  * create_product() writes a product, its variants and shop publishing in
--    one transaction
--  * serial-tracked stock: one row per unit (IMEI / serial number)
--  * batch-tracked stock: lots with expiry dates
--  * receive_stock / remove_stock / transfer_stock are the only write paths;
--    each keeps inventory_levels, the detail rows and the ledger consistent
--  * reporting views (security_invoker, so RLS applies)
-- =============================================================================

-- products.brand is superseded by the per-category "brand" attribute.
alter table public.products drop column brand;

create type public.serial_status as enum ('in_stock', 'sold', 'damaged', 'written_off');

-- -----------------------------------------------------------------------------
-- Attribute validation
-- -----------------------------------------------------------------------------
create or replace function private.validate_attribute_values(
  p_organization_id uuid,
  p_category_id     uuid,
  p_values          jsonb,
  p_variant_options boolean
)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_def   public.attribute_definitions;
  v_key   text;
  v_value jsonb;
  v_kind  text := case when p_variant_options then 'variant option' else 'product detail' end;
begin
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'Expected an object of % values', v_kind using errcode = 'check_violation';
  end if;

  -- Every key must be defined for this category (or organization-wide).
  for v_key in select jsonb_object_keys(p_values) loop
    if not exists (
      select 1 from public.attribute_definitions a
      where a.organization_id = p_organization_id
        and (a.category_id = p_category_id or a.category_id is null)
        and a.key = v_key
        and a.is_variant_option = p_variant_options
    ) then
      raise exception 'Unknown % "%"', v_kind, v_key using errcode = 'check_violation';
    end if;
  end loop;

  for v_def in
    select * from public.attribute_definitions a
    where a.organization_id = p_organization_id
      and (a.category_id = p_category_id or a.category_id is null)
      and a.is_variant_option = p_variant_options
  loop
    v_value := p_values -> v_def.key;

    if v_value is null or v_value = 'null'::jsonb
       or (jsonb_typeof(v_value) = 'string' and btrim(v_value #>> '{}') = '')
       or (jsonb_typeof(v_value) = 'array' and jsonb_array_length(v_value) = 0) then
      if v_def.is_required and not p_variant_options then
        raise exception '"%" is required', v_def.label using errcode = 'check_violation';
      end if;
      continue;
    end if;

    case v_def.type
      when 'number' then
        if jsonb_typeof(v_value) <> 'number' then
          raise exception '"%" must be a number', v_def.label using errcode = 'check_violation';
        end if;
      when 'boolean' then
        if jsonb_typeof(v_value) <> 'boolean' then
          raise exception '"%" must be yes or no', v_def.label using errcode = 'check_violation';
        end if;
      when 'select' then
        if jsonb_typeof(v_value) <> 'string' or not ((v_value #>> '{}') = any (v_def.options)) then
          raise exception '"%" must be one of: %', v_def.label, array_to_string(v_def.options, ', ')
            using errcode = 'check_violation';
        end if;
      when 'multiselect' then
        if jsonb_typeof(v_value) <> 'array' or exists (
          select 1 from jsonb_array_elements(v_value) e
          where jsonb_typeof(e) <> 'string' or not ((e #>> '{}') = any (v_def.options))
        ) then
          raise exception '"%" must only contain: %', v_def.label, array_to_string(v_def.options, ', ')
            using errcode = 'check_violation';
        end if;
      when 'date' then
        if jsonb_typeof(v_value) <> 'string' or (v_value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
          raise exception '"%" must be a date (YYYY-MM-DD)', v_def.label using errcode = 'check_violation';
        end if;
      else -- text
        if jsonb_typeof(v_value) not in ('string', 'number') then
          raise exception '"%" must be text', v_def.label using errcode = 'check_violation';
        end if;
    end case;
  end loop;
end;
$$;

create or replace function private.validate_product_attributes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_variant record;
begin
  perform private.validate_attribute_values(new.organization_id, new.category_id, new.attributes, false);

  -- A category change must still fit every existing variant's options.
  if tg_op = 'UPDATE' and new.category_id is distinct from old.category_id then
    for v_variant in select options from public.product_variants where product_id = new.id loop
      perform private.validate_attribute_values(new.organization_id, new.category_id, v_variant.options, true);
    end loop;
  end if;
  return new;
end;
$$;

create trigger products_validate_attributes
  before insert or update of attributes, category_id on public.products
  for each row execute function private.validate_product_attributes();

create or replace function private.validate_variant_options()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_category_id uuid;
begin
  select category_id into v_category_id from public.products where id = new.product_id;
  perform private.validate_attribute_values(new.organization_id, v_category_id, new.options, true);
  return new;
end;
$$;

create trigger product_variants_validate_options
  before insert or update of options on public.product_variants
  for each row execute function private.validate_variant_options();

-- Two variants of the same product cannot have identical options.
create unique index product_variants_unique_options
  on public.product_variants (product_id, options)
  where is_active;

-- Removing a field strips its values from products; a variant option that is
-- in use cannot be removed (it would merge variants).
create or replace function private.on_attribute_definition_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.organizations where id = old.organization_id) then
    return old; -- organization is being deleted
  end if;

  if old.is_variant_option then
    if exists (
      select 1 from public.product_variants v
      join public.products p on p.id = v.product_id
      where p.organization_id = old.organization_id
        and (old.category_id is null or p.category_id = old.category_id)
        and v.options ? old.key
    ) then
      raise exception 'Variant option "%" is used by existing variants and cannot be removed', old.label
        using errcode = 'check_violation';
    end if;
  else
    update public.products
    set attributes = attributes - old.key
    where organization_id = old.organization_id
      and (old.category_id is null or category_id = old.category_id)
      and attributes ? old.key;
  end if;
  return old;
end;
$$;

create trigger attribute_definitions_on_delete
  before delete on public.attribute_definitions
  for each row execute function private.on_attribute_definition_deleted();

-- A category's tracking mode is fixed once it has products.
create or replace function private.guard_category_tracking()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tracking is distinct from old.tracking
     and exists (select 1 from public.products where category_id = new.id) then
    raise exception 'Stock tracking cannot change for a category that already has products'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger categories_guard_tracking
  before update of tracking on public.categories
  for each row execute function private.guard_category_tracking();

-- -----------------------------------------------------------------------------
-- create_product: product + variants + shop publishing, atomically
-- -----------------------------------------------------------------------------
create or replace function public.create_product(
  p_organization_id uuid,
  p_product         jsonb,
  p_variants        jsonb,
  p_shop_ids        uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_id uuid;
  v_variant    jsonb;
  v_status     public.product_status := coalesce((p_product ->> 'status')::public.product_status, 'draft');
begin
  if not private.has_org_role(p_organization_id, array['owner', 'admin', 'manager']::public.org_role[]) then
    raise exception 'Not allowed to create products' using errcode = '42501';
  end if;
  if jsonb_typeof(p_variants) <> 'array' or jsonb_array_length(p_variants) = 0 then
    raise exception 'A product needs at least one variant' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_variants) > 250 then
    raise exception 'A product can have at most 250 variants' using errcode = 'check_violation';
  end if;

  insert into public.products (
    organization_id, title, slug, description, status, category_id, attributes, tags,
    hsn_code, gst_rate, created_by
  ) values (
    p_organization_id,
    p_product ->> 'title',
    p_product ->> 'slug',
    nullif(p_product ->> 'description', ''),
    v_status,
    nullif(p_product ->> 'category_id', '')::uuid,
    coalesce(p_product -> 'attributes', '{}'::jsonb),
    coalesce(array(select jsonb_array_elements_text(p_product -> 'tags')), '{}'),
    nullif(p_product ->> 'hsn_code', ''),
    nullif(p_product ->> 'gst_rate', '')::numeric,
    auth.uid()
  )
  returning id into v_product_id;

  for v_variant in select * from jsonb_array_elements(p_variants) loop
    insert into public.product_variants (
      organization_id, product_id, sku, title, options, price, compare_at_price, cost_price, barcode
    ) values (
      p_organization_id,
      v_product_id,
      v_variant ->> 'sku',
      coalesce(nullif(v_variant ->> 'title', ''), 'Default'),
      coalesce(v_variant -> 'options', '{}'::jsonb),
      (v_variant ->> 'price')::numeric,
      nullif(v_variant ->> 'compare_at_price', '')::numeric,
      nullif(v_variant ->> 'cost_price', '')::numeric,
      nullif(v_variant ->> 'barcode', '')
    );
  end loop;

  insert into public.shop_products (organization_id, shop_id, product_id, is_published, published_at)
  select p_organization_id, s, v_product_id, v_status = 'active', case when v_status = 'active' then now() end
  from unnest(coalesce(p_shop_ids, '{}')) as s;

  perform private.log_audit(p_organization_id, 'product.created', 'product', v_product_id,
    jsonb_build_object('variants', jsonb_array_length(p_variants), 'shops', cardinality(coalesce(p_shop_ids, '{}'))));

  return v_product_id;
end;
$$;

revoke all on function public.create_product(uuid, jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.create_product(uuid, jsonb, jsonb, uuid[]) to authenticated;

-- -----------------------------------------------------------------------------
-- Serial & batch stock
-- -----------------------------------------------------------------------------
create table public.inventory_serials (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  variant_id       uuid not null,
  warehouse_id     uuid not null,
  serial_number    text not null check (serial_number ~ '^[A-Za-z0-9._/-]{3,64}$'),
  status           public.serial_status not null default 'in_stock',
  received_at      timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- An IMEI / serial identifies one physical unit across the whole business.
  unique (organization_id, serial_number),
  foreign key (organization_id, variant_id) references public.product_variants (organization_id, id) on delete cascade,
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id) on delete restrict
);

create index inventory_serials_stock_idx
  on public.inventory_serials (variant_id, warehouse_id)
  where status = 'in_stock';

create trigger inventory_serials_set_updated_at
  before update on public.inventory_serials
  for each row execute function private.set_updated_at();

create table public.inventory_batches (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  variant_id       uuid not null,
  warehouse_id     uuid not null,
  batch_code       text not null check (batch_code ~ '^[A-Za-z0-9._/-]{1,40}$'),
  expiry_date      date,
  on_hand          integer not null default 0 check (on_hand >= 0),
  received_at      timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (variant_id, warehouse_id, batch_code),
  unique (organization_id, id),
  foreign key (organization_id, variant_id) references public.product_variants (organization_id, id) on delete cascade,
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id) on delete restrict
);

-- FEFO: first-expiry-first-out picking order.
create index inventory_batches_fefo_idx
  on public.inventory_batches (variant_id, warehouse_id, expiry_date nulls last)
  where on_hand > 0;

create trigger inventory_batches_set_updated_at
  before update on public.inventory_batches
  for each row execute function private.set_updated_at();

alter table public.stock_movements
  add column serial_numbers text[],
  add column batch_id uuid,
  add constraint stock_movements_batch_fk
    foreign key (organization_id, batch_id) references public.inventory_batches (organization_id, id)
    on delete set null (batch_id);

-- -----------------------------------------------------------------------------
-- Stock primitives (private): authorize, then apply a delta + ledger entry
-- -----------------------------------------------------------------------------
create or replace function private.authorize_stock_change(p_variant_id uuid, p_warehouse_id uuid)
returns table (organization_id uuid, tracking public.inventory_tracking)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org      uuid;
  v_tracking public.inventory_tracking;
begin
  select v.organization_id, p.tracking into v_org, v_tracking
  from public.product_variants v
  join public.products p on p.id = v.product_id
  join public.warehouses w on w.id = p_warehouse_id and w.organization_id = v.organization_id
  where v.id = p_variant_id;

  if v_org is null then
    raise exception 'Variant or warehouse not found' using errcode = 'no_data_found';
  end if;
  if not private.has_org_role(v_org, array['owner', 'admin', 'manager', 'staff']::public.org_role[]) then
    raise exception 'Not allowed to change stock' using errcode = '42501';
  end if;

  return query select v_org, v_tracking;
end;
$$;

create or replace function private.apply_stock_delta(
  p_organization_id uuid,
  p_variant_id      uuid,
  p_warehouse_id    uuid,
  p_delta           integer,
  p_type            public.stock_movement_type,
  p_note            text,
  p_reference_type  text,
  p_reference_id    uuid,
  p_serials         text[] default null,
  p_batch_id        uuid default null
)
returns public.inventory_levels
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level public.inventory_levels;
begin
  if p_delta is null or p_delta = 0 then
    raise exception 'Quantity must be non-zero' using errcode = 'check_violation';
  end if;

  insert into public.inventory_levels (organization_id, variant_id, warehouse_id)
  values (p_organization_id, p_variant_id, p_warehouse_id)
  on conflict (variant_id, warehouse_id) do nothing;

  select * into v_level
  from public.inventory_levels
  where variant_id = p_variant_id and warehouse_id = p_warehouse_id
  for update;

  if v_level.on_hand + p_delta < v_level.reserved then
    raise exception 'Insufficient stock: % on hand, % reserved, change %',
      v_level.on_hand, v_level.reserved, p_delta
      using errcode = 'check_violation';
  end if;

  update public.inventory_levels
  set on_hand = on_hand + p_delta, updated_at = now()
  where variant_id = p_variant_id and warehouse_id = p_warehouse_id
  returning * into v_level;

  insert into public.stock_movements (
    organization_id, variant_id, warehouse_id, type, quantity, balance_after,
    reference_type, reference_id, note, created_by, serial_numbers, batch_id
  ) values (
    p_organization_id, p_variant_id, p_warehouse_id, p_type, p_delta, v_level.on_hand,
    p_reference_type, p_reference_id, nullif(btrim(p_note), ''), auth.uid(), p_serials, p_batch_id
  );

  return v_level;
end;
$$;

-- Normalise and validate a list of serial numbers (trimmed, unique, non-empty).
create or replace function private.clean_serials(p_serials text[])
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_clean text[];
begin
  select array_agg(s order by ord) into v_clean
  from (
    select distinct on (upper(btrim(x))) upper(btrim(x)) as s, ord
    from unnest(p_serials) with ordinality as t(x, ord)
    where btrim(coalesce(x, '')) <> ''
    order by upper(btrim(x)), ord
  ) d;

  if v_clean is null or cardinality(v_clean) = 0 then
    raise exception 'Enter at least one serial number' using errcode = 'check_violation';
  end if;
  if cardinality(v_clean) <> (select count(*) from unnest(p_serials) x where btrim(coalesce(x, '')) <> '') then
    raise exception 'The same serial number was entered more than once' using errcode = 'check_violation';
  end if;
  if cardinality(v_clean) > 500 then
    raise exception 'At most 500 serial numbers per entry' using errcode = 'check_violation';
  end if;
  return v_clean;
end;
$$;

-- -----------------------------------------------------------------------------
-- Public stock operations
-- -----------------------------------------------------------------------------

-- Plain adjustment, now limited to quantity-tracked products.
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
  v_auth record;
begin
  select * into v_auth from private.authorize_stock_change(p_variant_id, p_warehouse_id);
  if v_auth.tracking <> 'quantity' then
    raise exception 'This product is tracked by %; use receive or remove stock with % details',
      v_auth.tracking, v_auth.tracking using errcode = 'check_violation';
  end if;
  return private.apply_stock_delta(v_auth.organization_id, p_variant_id, p_warehouse_id, p_quantity,
    p_type, p_note, p_reference_type, p_reference_id);
end;
$$;

create or replace function public.receive_stock(
  p_variant_id   uuid,
  p_warehouse_id uuid,
  p_quantity     integer default null,
  p_serials      text[] default null,
  p_batch_code   text default null,
  p_expiry_date  date default null,
  p_note         text default null,
  p_type         public.stock_movement_type default 'receipt'
)
returns public.inventory_levels
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth     record;
  v_serials  text[];
  v_batch_id uuid;
  v_qty      integer;
begin
  if p_type not in ('receipt', 'return', 'adjustment') then
    raise exception 'Receiving supports receipt, return or adjustment' using errcode = 'check_violation';
  end if;

  select * into v_auth from private.authorize_stock_change(p_variant_id, p_warehouse_id);

  case v_auth.tracking
    when 'serial' then
      v_serials := private.clean_serials(p_serials);
      v_qty := cardinality(v_serials);
      begin
        insert into public.inventory_serials (organization_id, variant_id, warehouse_id, serial_number)
        select v_auth.organization_id, p_variant_id, p_warehouse_id, s from unnest(v_serials) s;
      exception when unique_violation then
        raise exception 'One or more serial numbers already exist: %', (
          select string_agg(serial_number, ', ') from public.inventory_serials
          where organization_id = v_auth.organization_id and serial_number = any (v_serials)
        ) using errcode = 'unique_violation';
      end;

    when 'batch' then
      if p_batch_code is null or btrim(p_batch_code) = '' then
        raise exception 'Batch code is required' using errcode = 'check_violation';
      end if;
      if p_quantity is null or p_quantity <= 0 then
        raise exception 'Quantity must be positive' using errcode = 'check_violation';
      end if;
      v_qty := p_quantity;
      insert into public.inventory_batches (organization_id, variant_id, warehouse_id, batch_code, expiry_date, on_hand)
      values (v_auth.organization_id, p_variant_id, p_warehouse_id, upper(btrim(p_batch_code)), p_expiry_date, p_quantity)
      on conflict (variant_id, warehouse_id, batch_code) do update
        set on_hand = public.inventory_batches.on_hand + excluded.on_hand,
            expiry_date = coalesce(public.inventory_batches.expiry_date, excluded.expiry_date)
      returning id into v_batch_id;

    else
      if p_quantity is null or p_quantity <= 0 then
        raise exception 'Quantity must be positive' using errcode = 'check_violation';
      end if;
      v_qty := p_quantity;
  end case;

  return private.apply_stock_delta(v_auth.organization_id, p_variant_id, p_warehouse_id, v_qty,
    p_type, p_note, null, null, v_serials, v_batch_id);
end;
$$;

create or replace function public.remove_stock(
  p_variant_id   uuid,
  p_warehouse_id uuid,
  p_type         public.stock_movement_type,
  p_quantity     integer default null,
  p_serials      text[] default null,
  p_batch_id     uuid default null,
  p_note         text default null
)
returns public.inventory_levels
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth    record;
  v_serials text[];
  v_qty     integer;
  v_found   integer;
begin
  if p_type not in ('adjustment', 'damage', 'sale') then
    raise exception 'Removal supports adjustment, damage or sale' using errcode = 'check_violation';
  end if;

  select * into v_auth from private.authorize_stock_change(p_variant_id, p_warehouse_id);

  case v_auth.tracking
    when 'serial' then
      v_serials := private.clean_serials(p_serials);
      v_qty := cardinality(v_serials);
      update public.inventory_serials
      set status = case p_type when 'damage' then 'damaged' when 'sale' then 'sold' else 'written_off' end::public.serial_status
      where organization_id = v_auth.organization_id
        and variant_id = p_variant_id
        and warehouse_id = p_warehouse_id
        and status = 'in_stock'
        and serial_number = any (v_serials);
      get diagnostics v_found = row_count;
      if v_found <> v_qty then
        raise exception 'Some serial numbers are not in stock at this warehouse' using errcode = 'check_violation';
      end if;

    when 'batch' then
      if p_batch_id is null then
        raise exception 'Choose the batch to remove from' using errcode = 'check_violation';
      end if;
      if p_quantity is null or p_quantity <= 0 then
        raise exception 'Quantity must be positive' using errcode = 'check_violation';
      end if;
      v_qty := p_quantity;
      update public.inventory_batches
      set on_hand = on_hand - p_quantity
      where id = p_batch_id and variant_id = p_variant_id and warehouse_id = p_warehouse_id
        and on_hand >= p_quantity;
      if not found then
        raise exception 'Not enough stock in that batch' using errcode = 'check_violation';
      end if;

    else
      if p_quantity is null or p_quantity <= 0 then
        raise exception 'Quantity must be positive' using errcode = 'check_violation';
      end if;
      v_qty := p_quantity;
  end case;

  return private.apply_stock_delta(v_auth.organization_id, p_variant_id, p_warehouse_id, -v_qty,
    p_type, p_note, null, null, v_serials, p_batch_id);
end;
$$;

create or replace function public.transfer_stock(
  p_variant_id        uuid,
  p_from_warehouse_id uuid,
  p_to_warehouse_id   uuid,
  p_quantity          integer default null,
  p_serials           text[] default null,
  p_batch_id          uuid default null,
  p_note              text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from        record;
  v_to          record;
  v_serials     text[];
  v_qty         integer;
  v_found       integer;
  v_transfer_id uuid := gen_random_uuid();
  v_batch       public.inventory_batches;
  v_to_batch_id uuid;
begin
  if p_from_warehouse_id = p_to_warehouse_id then
    raise exception 'Choose two different warehouses' using errcode = 'check_violation';
  end if;

  select * into v_from from private.authorize_stock_change(p_variant_id, p_from_warehouse_id);
  select * into v_to from private.authorize_stock_change(p_variant_id, p_to_warehouse_id);

  case v_from.tracking
    when 'serial' then
      v_serials := private.clean_serials(p_serials);
      v_qty := cardinality(v_serials);
      update public.inventory_serials
      set warehouse_id = p_to_warehouse_id
      where organization_id = v_from.organization_id
        and variant_id = p_variant_id
        and warehouse_id = p_from_warehouse_id
        and status = 'in_stock'
        and serial_number = any (v_serials);
      get diagnostics v_found = row_count;
      if v_found <> v_qty then
        raise exception 'Some serial numbers are not in stock at the source warehouse' using errcode = 'check_violation';
      end if;

    when 'batch' then
      if p_quantity is null or p_quantity <= 0 then
        raise exception 'Quantity must be positive' using errcode = 'check_violation';
      end if;
      v_qty := p_quantity;
      update public.inventory_batches
      set on_hand = on_hand - p_quantity
      where id = p_batch_id and variant_id = p_variant_id and warehouse_id = p_from_warehouse_id
        and on_hand >= p_quantity
      returning * into v_batch;
      if v_batch.id is null then
        raise exception 'Not enough stock in that batch' using errcode = 'check_violation';
      end if;
      insert into public.inventory_batches (organization_id, variant_id, warehouse_id, batch_code, expiry_date, on_hand)
      values (v_from.organization_id, p_variant_id, p_to_warehouse_id, v_batch.batch_code, v_batch.expiry_date, p_quantity)
      on conflict (variant_id, warehouse_id, batch_code) do update
        set on_hand = public.inventory_batches.on_hand + excluded.on_hand
      returning id into v_to_batch_id;

    else
      if p_quantity is null or p_quantity <= 0 then
        raise exception 'Quantity must be positive' using errcode = 'check_violation';
      end if;
      v_qty := p_quantity;
  end case;

  perform private.apply_stock_delta(v_from.organization_id, p_variant_id, p_from_warehouse_id, -v_qty,
    'transfer_out', p_note, 'transfer', v_transfer_id, v_serials, p_batch_id);
  perform private.apply_stock_delta(v_from.organization_id, p_variant_id, p_to_warehouse_id, v_qty,
    'transfer_in', p_note, 'transfer', v_transfer_id, v_serials, v_to_batch_id);

  return v_transfer_id;
end;
$$;

revoke all on function public.receive_stock(uuid, uuid, integer, text[], text, date, text, public.stock_movement_type) from public, anon;
revoke all on function public.remove_stock(uuid, uuid, public.stock_movement_type, integer, text[], uuid, text) from public, anon;
revoke all on function public.transfer_stock(uuid, uuid, uuid, integer, text[], uuid, text) from public, anon;
grant execute on function public.receive_stock(uuid, uuid, integer, text[], text, date, text, public.stock_movement_type) to authenticated;
grant execute on function public.remove_stock(uuid, uuid, public.stock_movement_type, integer, text[], uuid, text) to authenticated;
grant execute on function public.transfer_stock(uuid, uuid, uuid, integer, text[], uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Reporting views (security_invoker: the caller's RLS applies)
-- -----------------------------------------------------------------------------
create view public.inventory_overview
with (security_invoker = true) as
select
  il.organization_id,
  il.variant_id,
  il.warehouse_id,
  v.sku,
  v.title            as variant_title,
  p.id               as product_id,
  p.title            as product_title,
  p.tracking,
  p.category_id,
  c.name             as category_name,
  w.name             as warehouse_name,
  w.code             as warehouse_code,
  il.on_hand,
  il.reserved,
  il.available,
  il.reorder_point,
  (il.available <= il.reorder_point) as is_low,
  (
    select min(b.expiry_date) from public.inventory_batches b
    where b.variant_id = il.variant_id and b.warehouse_id = il.warehouse_id and b.on_hand > 0
  ) as next_expiry,
  il.updated_at
from public.inventory_levels il
join public.product_variants v on v.id = il.variant_id
join public.products p on p.id = v.product_id
join public.warehouses w on w.id = il.warehouse_id
left join public.categories c on c.id = p.category_id;

create view public.product_overview
with (security_invoker = true) as
select
  p.id,
  p.organization_id,
  p.title,
  p.slug,
  p.status,
  p.tracking,
  p.category_id,
  c.name as category_name,
  p.created_at,
  p.updated_at,
  coalesce(vs.variant_count, 0) as variant_count,
  vs.min_price,
  vs.max_price,
  coalesce(st.on_hand, 0)   as on_hand,
  coalesce(st.available, 0) as available,
  coalesce(st.low_locations, 0) as low_stock_locations
from public.products p
left join public.categories c on c.id = p.category_id
left join lateral (
  select count(*) as variant_count, min(v.price) as min_price, max(v.price) as max_price
  from public.product_variants v where v.product_id = p.id and v.is_active
) vs on true
left join lateral (
  select sum(il.on_hand) as on_hand, sum(il.available) as available,
         count(*) filter (where il.available <= il.reorder_point) as low_locations
  from public.inventory_levels il
  join public.product_variants v on v.id = il.variant_id
  where v.product_id = p.id
) st on true;

revoke all on public.inventory_overview from anon;
revoke all on public.product_overview from anon;
grant select on public.inventory_overview to authenticated;
grant select on public.product_overview to authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security (detail rows are written only by the functions above)
-- -----------------------------------------------------------------------------
alter table public.inventory_serials enable row level security;
alter table public.inventory_batches enable row level security;

create policy "serials: members read" on public.inventory_serials
  for select to authenticated using (private.is_org_member(organization_id));
create policy "batches: members read" on public.inventory_batches
  for select to authenticated using (private.is_org_member(organization_id));

revoke insert, update, delete on public.inventory_serials from authenticated, anon;
revoke insert, update, delete on public.inventory_batches from authenticated, anon;
