-- =============================================================================
-- Shopverse · Migration 005 · Multi-vertical catalogue
-- Businesses sell anything: clothing, electronics, kitchenware, groceries…
--  * organizations declare the industries they sell in
--  * categories form a per-organization tree
--  * attribute_definitions describe the fields each category needs
--    (e.g. Storage for phones, Capacity for cookware, Shade for makeup) and
--    which of them create variants
--  * every category picks how stock is tracked: plain quantity, serial
--    numbers (phones, appliances) or batches with expiry (food, cosmetics)
-- New organizations get a starter catalogue seeded from built-in templates.
-- =============================================================================

create type public.inventory_tracking as enum ('quantity', 'serial', 'batch');
create type public.attribute_type as enum ('text', 'number', 'boolean', 'select', 'multiselect', 'date');

-- Supported industries. A text column with a CHECK (rather than an enum) so new
-- industries can be added without an enum migration.
alter table public.organizations
  add column industries text[] not null default '{}'
  constraint organizations_industries_valid check (
    industries <@ array[
      'fashion', 'electronics', 'home_kitchen', 'grocery', 'beauty', 'books',
      'toys', 'sports', 'furniture', 'jewellery', 'stationery', 'other'
    ]::text[]
  );

-- -----------------------------------------------------------------------------
-- Categories (tree)
-- -----------------------------------------------------------------------------
create table public.categories (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  parent_id        uuid,
  name             text not null check (char_length(name) between 2 and 80),
  slug             text not null check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$'),
  description      text,
  industry         text,
  tracking         public.inventory_tracking not null default 'quantity',
  -- Tax defaults are left for the merchant to set; rates and HSN codes vary by product.
  hsn_code         text check (hsn_code is null or hsn_code ~ '^[0-9]{4,8}$'),
  gst_rate         numeric(5, 2) check (gst_rate is null or gst_rate between 0 and 100),
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, parent_id) references public.categories (organization_id, id) on delete cascade,
  constraint categories_not_own_parent check (parent_id is null or parent_id <> id)
);

-- Slugs are unique among siblings (NULLS NOT DISTINCT makes top-level unique too).
create unique index categories_sibling_slug_uidx
  on public.categories (organization_id, parent_id, slug) nulls not distinct;
create index categories_parent_idx on public.categories (parent_id);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function private.set_updated_at();

create trigger categories_audit
  after insert or update or delete on public.categories
  for each row execute function private.audit_row_change('category');

-- -----------------------------------------------------------------------------
-- Attribute definitions
-- -----------------------------------------------------------------------------
create table public.attribute_definitions (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null,
  -- NULL = applies to every product in the organization.
  category_id        uuid,
  key                text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label              text not null check (char_length(label) between 1 and 60),
  type               public.attribute_type not null default 'text',
  options            text[] not null default '{}',
  unit               text check (unit is null or char_length(unit) <= 12),
  is_required        boolean not null default false,
  -- Variant options generate SKUs (Size × Colour, Storage × Colour, Capacity…).
  is_variant_option  boolean not null default false,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (organization_id) references public.organizations (id) on delete cascade,
  foreign key (organization_id, category_id) references public.categories (organization_id, id) on delete cascade,
  constraint attribute_options_match_type check (
    (type in ('select', 'multiselect') and cardinality(options) > 0)
    or (type not in ('select', 'multiselect') and cardinality(options) = 0)
  ),
  constraint attribute_variant_types check (
    not is_variant_option or type in ('select', 'text', 'number')
  )
);

create unique index attribute_definitions_key_uidx
  on public.attribute_definitions (organization_id, category_id, key) nulls not distinct;

create trigger attribute_definitions_set_updated_at
  before update on public.attribute_definitions
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Products: category, structured attributes, tax and tracking
-- -----------------------------------------------------------------------------
alter table public.products
  add column category_id uuid,
  add column attributes jsonb not null default '{}'::jsonb
    constraint products_attributes_object check (jsonb_typeof(attributes) = 'object'),
  add column tracking public.inventory_tracking not null default 'quantity',
  add column hsn_code text check (hsn_code is null or hsn_code ~ '^[0-9]{4,8}$'),
  add column gst_rate numeric(5, 2) check (gst_rate is null or gst_rate between 0 and 100),
  add constraint products_category_fk
    foreign key (organization_id, category_id)
    references public.categories (organization_id, id) on delete set null (category_id);

-- The old free-text column is superseded by category_id.
alter table public.products drop column category;

create index products_category_idx on public.products (category_id);

-- New products inherit tracking and tax defaults from their category.
create or replace function private.apply_category_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_category public.categories;
begin
  if new.category_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.category_id is not distinct from old.category_id then
    return new;
  end if;

  select * into v_category from public.categories where id = new.category_id;
  if tg_op = 'INSERT' then
    new.tracking := v_category.tracking;
  end if;
  new.hsn_code := coalesce(new.hsn_code, v_category.hsn_code);
  new.gst_rate := coalesce(new.gst_rate, v_category.gst_rate);
  return new;
end;
$$;

create trigger products_apply_category_defaults
  before insert or update of category_id on public.products
  for each row execute function private.apply_category_defaults();

-- -----------------------------------------------------------------------------
-- Built-in industry templates (read by the seeding function only)
-- -----------------------------------------------------------------------------
create or replace function private.industry_templates()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select $json$
  {
    "fashion": [
      { "name": "Clothing", "tracking": "quantity", "attributes": [
        { "key": "size", "label": "Size", "type": "select", "options": ["XS","S","M","L","XL","XXL"], "variant": true },
        { "key": "colour", "label": "Colour", "type": "text", "variant": true },
        { "key": "material", "label": "Material", "type": "text" },
        { "key": "fit", "label": "Fit", "type": "select", "options": ["Slim","Regular","Relaxed"] } ] },
      { "name": "Footwear", "tracking": "quantity", "attributes": [
        { "key": "uk_size", "label": "UK size", "type": "select", "options": ["5","6","7","8","9","10","11"], "variant": true },
        { "key": "colour", "label": "Colour", "type": "text", "variant": true } ] },
      { "name": "Bags & accessories", "tracking": "quantity", "attributes": [
        { "key": "colour", "label": "Colour", "type": "text", "variant": true },
        { "key": "material", "label": "Material", "type": "text" } ] }
    ],
    "electronics": [
      { "name": "Mobile phones", "tracking": "serial", "attributes": [
        { "key": "brand", "label": "Brand", "type": "text", "required": true },
        { "key": "model", "label": "Model", "type": "text", "required": true },
        { "key": "storage", "label": "Storage", "type": "select", "options": ["64 GB","128 GB","256 GB","512 GB","1 TB"], "variant": true },
        { "key": "colour", "label": "Colour", "type": "text", "variant": true },
        { "key": "warranty_months", "label": "Warranty", "type": "number", "unit": "months" } ] },
      { "name": "Laptops", "tracking": "serial", "attributes": [
        { "key": "brand", "label": "Brand", "type": "text", "required": true },
        { "key": "processor", "label": "Processor", "type": "text" },
        { "key": "ram", "label": "RAM", "type": "select", "options": ["8 GB","16 GB","32 GB","64 GB"], "variant": true },
        { "key": "storage", "label": "Storage", "type": "select", "options": ["256 GB","512 GB","1 TB","2 TB"], "variant": true },
        { "key": "screen_size", "label": "Screen size", "type": "number", "unit": "inch" },
        { "key": "warranty_months", "label": "Warranty", "type": "number", "unit": "months" } ] },
      { "name": "Audio", "tracking": "serial", "attributes": [
        { "key": "brand", "label": "Brand", "type": "text" },
        { "key": "connectivity", "label": "Connectivity", "type": "multiselect", "options": ["Bluetooth","Wired","USB-C"] },
        { "key": "colour", "label": "Colour", "type": "text", "variant": true } ] },
      { "name": "Chargers & cables", "tracking": "quantity", "attributes": [
        { "key": "connector", "label": "Connector", "type": "select", "options": ["USB-C","Lightning","Micro-USB"], "variant": true },
        { "key": "wattage", "label": "Wattage", "type": "number", "unit": "W" } ] }
    ],
    "home_kitchen": [
      { "name": "Cookware", "tracking": "quantity", "attributes": [
        { "key": "material", "label": "Material", "type": "select", "options": ["Stainless steel","Cast iron","Aluminium","Non-stick","Copper","Clay"] },
        { "key": "capacity", "label": "Capacity", "type": "number", "unit": "L", "variant": true },
        { "key": "induction_compatible", "label": "Induction compatible", "type": "boolean" } ] },
      { "name": "Tableware & utensils", "tracking": "quantity", "attributes": [
        { "key": "material", "label": "Material", "type": "select", "options": ["Stainless steel","Ceramic","Glass","Melamine","Wood","Brass"] },
        { "key": "pieces", "label": "Pieces in set", "type": "number", "variant": true },
        { "key": "dishwasher_safe", "label": "Dishwasher safe", "type": "boolean" } ] },
      { "name": "Kitchen appliances", "tracking": "serial", "attributes": [
        { "key": "brand", "label": "Brand", "type": "text", "required": true },
        { "key": "wattage", "label": "Power", "type": "number", "unit": "W" },
        { "key": "warranty_months", "label": "Warranty", "type": "number", "unit": "months" } ] },
      { "name": "Storage & containers", "tracking": "quantity", "attributes": [
        { "key": "capacity", "label": "Capacity", "type": "number", "unit": "ml", "variant": true },
        { "key": "material", "label": "Material", "type": "text" } ] }
    ],
    "grocery": [
      { "name": "Packaged food", "tracking": "batch", "attributes": [
        { "key": "net_weight", "label": "Net weight", "type": "number", "unit": "g", "variant": true },
        { "key": "diet", "label": "Diet", "type": "select", "options": ["Veg","Non-veg","Vegan"], "required": true },
        { "key": "shelf_life_days", "label": "Shelf life", "type": "number", "unit": "days" } ] },
      { "name": "Beverages", "tracking": "batch", "attributes": [
        { "key": "volume", "label": "Volume", "type": "number", "unit": "ml", "variant": true },
        { "key": "diet", "label": "Diet", "type": "select", "options": ["Veg","Vegan"] } ] },
      { "name": "Staples", "tracking": "batch", "attributes": [
        { "key": "net_weight", "label": "Net weight", "type": "number", "unit": "kg", "variant": true },
        { "key": "organic", "label": "Organic", "type": "boolean" } ] }
    ],
    "beauty": [
      { "name": "Skincare", "tracking": "batch", "attributes": [
        { "key": "volume", "label": "Volume", "type": "number", "unit": "ml", "variant": true },
        { "key": "skin_type", "label": "Skin type", "type": "multiselect", "options": ["Dry","Oily","Combination","Sensitive","All"] } ] },
      { "name": "Makeup", "tracking": "batch", "attributes": [
        { "key": "shade", "label": "Shade", "type": "text", "variant": true },
        { "key": "finish", "label": "Finish", "type": "select", "options": ["Matte","Satin","Glossy"] } ] },
      { "name": "Hair care", "tracking": "batch", "attributes": [
        { "key": "volume", "label": "Volume", "type": "number", "unit": "ml", "variant": true },
        { "key": "hair_type", "label": "Hair type", "type": "multiselect", "options": ["Straight","Wavy","Curly","All"] } ] }
    ],
    "books": [
      { "name": "Books", "tracking": "quantity", "attributes": [
        { "key": "author", "label": "Author", "type": "text", "required": true },
        { "key": "isbn", "label": "ISBN", "type": "text" },
        { "key": "publisher", "label": "Publisher", "type": "text" },
        { "key": "language", "label": "Language", "type": "select", "options": ["English","Hindi","Kannada","Tamil","Telugu","Marathi","Bengali","Other"] },
        { "key": "format", "label": "Format", "type": "select", "options": ["Paperback","Hardcover"], "variant": true } ] }
    ],
    "toys": [
      { "name": "Toys & games", "tracking": "quantity", "attributes": [
        { "key": "age_group", "label": "Age group", "type": "select", "options": ["0-2 years","3-5 years","6-8 years","9-12 years","13+ years"], "required": true },
        { "key": "battery_operated", "label": "Battery operated", "type": "boolean" },
        { "key": "material", "label": "Material", "type": "text" } ] }
    ],
    "sports": [
      { "name": "Sports equipment", "tracking": "quantity", "attributes": [
        { "key": "sport", "label": "Sport", "type": "text" },
        { "key": "size", "label": "Size", "type": "text", "variant": true },
        { "key": "weight", "label": "Weight", "type": "number", "unit": "kg" } ] },
      { "name": "Fitness", "tracking": "quantity", "attributes": [
        { "key": "weight", "label": "Weight", "type": "number", "unit": "kg", "variant": true },
        { "key": "material", "label": "Material", "type": "text" } ] }
    ],
    "furniture": [
      { "name": "Furniture", "tracking": "quantity", "attributes": [
        { "key": "material", "label": "Material", "type": "select", "options": ["Solid wood","Engineered wood","Metal","Plastic","Cane"] },
        { "key": "colour", "label": "Colour", "type": "text", "variant": true },
        { "key": "dimensions", "label": "Dimensions (L×W×H)", "type": "text" },
        { "key": "assembly_required", "label": "Assembly required", "type": "boolean" } ] }
    ],
    "jewellery": [
      { "name": "Jewellery", "tracking": "serial", "attributes": [
        { "key": "metal", "label": "Metal", "type": "select", "options": ["Gold","Silver","Platinum","Brass","Alloy"], "required": true },
        { "key": "purity", "label": "Purity", "type": "select", "options": ["24K","22K","18K","14K","925 Silver"] },
        { "key": "weight", "label": "Weight", "type": "number", "unit": "g" },
        { "key": "size", "label": "Size", "type": "text", "variant": true } ] }
    ],
    "stationery": [
      { "name": "Stationery", "tracking": "quantity", "attributes": [
        { "key": "pack_size", "label": "Pack size", "type": "number", "variant": true },
        { "key": "colour", "label": "Colour", "type": "text", "variant": true } ] }
    ],
    "other": [
      { "name": "General", "tracking": "quantity", "attributes": [] }
    ]
  }
  $json$::jsonb;
$$;

-- Display names for top-level industry categories.
create or replace function private.industry_label(p_industry text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_industry
    when 'fashion' then 'Fashion'
    when 'electronics' then 'Electronics'
    when 'home_kitchen' then 'Home & kitchen'
    when 'grocery' then 'Grocery'
    when 'beauty' then 'Beauty & personal care'
    when 'books' then 'Books'
    when 'toys' then 'Toys & games'
    when 'sports' then 'Sports & fitness'
    when 'furniture' then 'Furniture'
    when 'jewellery' then 'Jewellery'
    when 'stationery' then 'Stationery'
    else 'Other'
  end;
$$;

-- Seeds Industry > Category nodes plus their attribute definitions.
-- Idempotent: re-running for an industry that already exists is a no-op.
create or replace function private.seed_industry_catalog(p_organization_id uuid, p_industries text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_templates jsonb := private.industry_templates();
  v_industry  text;
  v_root_id   uuid;
  v_cat       jsonb;
  v_cat_id    uuid;
  v_attr      jsonb;
  v_root_pos  integer := 0;
  v_cat_pos   integer;
  v_attr_pos  integer;
begin
  foreach v_industry in array p_industries loop
    continue when not v_templates ? v_industry;
    v_root_pos := v_root_pos + 1;

    insert into public.categories (organization_id, name, slug, industry, sort_order)
    values (p_organization_id, private.industry_label(v_industry), replace(v_industry, '_', '-'), v_industry, v_root_pos)
    on conflict (organization_id, parent_id, slug) do nothing
    returning id into v_root_id;

    continue when v_root_id is null; -- already seeded

    v_cat_pos := 0;
    for v_cat in select * from jsonb_array_elements(v_templates -> v_industry) loop
      v_cat_pos := v_cat_pos + 1;
      insert into public.categories (organization_id, parent_id, name, slug, industry, tracking, sort_order)
      values (
        p_organization_id,
        v_root_id,
        v_cat ->> 'name',
        trim(both '-' from regexp_replace(lower(v_cat ->> 'name'), '[^a-z0-9]+', '-', 'g')),
        v_industry,
        (v_cat ->> 'tracking')::public.inventory_tracking,
        v_cat_pos
      )
      returning id into v_cat_id;

      v_attr_pos := 0;
      for v_attr in select * from jsonb_array_elements(v_cat -> 'attributes') loop
        v_attr_pos := v_attr_pos + 1;
        insert into public.attribute_definitions (
          organization_id, category_id, key, label, type, options, unit,
          is_required, is_variant_option, sort_order
        ) values (
          p_organization_id,
          v_cat_id,
          v_attr ->> 'key',
          v_attr ->> 'label',
          (v_attr ->> 'type')::public.attribute_type,
          coalesce(array(select jsonb_array_elements_text(v_attr -> 'options')), '{}'),
          v_attr ->> 'unit',
          coalesce((v_attr ->> 'required')::boolean, false),
          coalesce((v_attr ->> 'variant')::boolean, false),
          v_attr_pos
        );
      end loop;
    end loop;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- create_organization now records industries and seeds the starter catalogue.
-- -----------------------------------------------------------------------------
drop function public.create_organization(text, text, text, text, text, text, text, text);

create or replace function public.create_organization(
  p_name           text,
  p_slug           text,
  p_shop_name      text,
  p_shop_slug      text,
  p_currency       text,
  p_warehouse_name text,
  p_warehouse_code text,
  p_warehouse_city text,
  p_industries     text[] default array['other']
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id      uuid := auth.uid();
  v_org_id       uuid;
  v_shop_id      uuid;
  v_warehouse_id uuid;
  v_industries   text[] := coalesce(nullif(p_industries, '{}'), array['other']);
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if (select count(*) from public.organizations where created_by = v_user_id) >= 10 then
    raise exception 'Organization limit reached' using errcode = 'check_violation';
  end if;

  insert into public.organizations (name, slug, created_by, industries)
  values (trim(p_name), lower(p_slug), v_user_id, v_industries)
  returning id into v_org_id;

  insert into public.organization_members (organization_id, user_id, role, all_shops)
  values (v_org_id, v_user_id, 'owner', true);

  insert into public.shops (organization_id, name, slug, currency, status)
  values (v_org_id, trim(p_shop_name), lower(p_shop_slug), upper(p_currency), 'draft')
  returning id into v_shop_id;

  insert into public.warehouses (organization_id, name, code, address)
  values (
    v_org_id,
    trim(p_warehouse_name),
    upper(p_warehouse_code),
    jsonb_build_object('city', nullif(trim(p_warehouse_city), ''))
  )
  returning id into v_warehouse_id;

  insert into public.shop_warehouses (organization_id, shop_id, warehouse_id, priority)
  values (v_org_id, v_shop_id, v_warehouse_id, 1);

  perform private.seed_industry_catalog(v_org_id, v_industries);

  perform private.log_audit(v_org_id, 'organization.created', 'organization', v_org_id,
    jsonb_build_object('shop_id', v_shop_id, 'warehouse_id', v_warehouse_id, 'industries', to_jsonb(v_industries)));

  return jsonb_build_object(
    'organization_id', v_org_id,
    'organization_slug', lower(p_slug),
    'shop_id', v_shop_id,
    'warehouse_id', v_warehouse_id
  );
end;
$$;

revoke all on function public.create_organization(text, text, text, text, text, text, text, text, text[]) from public, anon;
grant execute on function public.create_organization(text, text, text, text, text, text, text, text, text[]) to authenticated;

-- Lets owners add an industry later and get its starter categories.
create or replace function public.add_industries(p_organization_id uuid, p_industries text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_org_role(p_organization_id, array['owner', 'admin']::public.org_role[]) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  update public.organizations
  set industries = (select array_agg(distinct i) from unnest(industries || p_industries) as i)
  where id = p_organization_id;

  perform private.seed_industry_catalog(p_organization_id, p_industries);
end;
$$;

revoke all on function public.add_industries(uuid, text[]) from public, anon;
grant execute on function public.add_industries(uuid, text[]) to authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.categories            enable row level security;
alter table public.attribute_definitions enable row level security;

create policy "categories: members read" on public.categories
  for select to authenticated using (private.is_org_member(organization_id));
create policy "categories: managers write" on public.categories
  for all to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]));

create policy "attributes: members read" on public.attribute_definitions
  for select to authenticated using (private.is_org_member(organization_id));
create policy "attributes: managers write" on public.attribute_definitions
  for all to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['owner', 'admin', 'manager']::public.org_role[]));
