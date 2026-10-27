-- =============================================================================
-- Shopverse · Migration 007 · Catalogue administration
--  * update_product(): edit product, variants and shop publishing atomically
--  * set_warehouse_shops(): replace which shops a warehouse fulfils, atomically
--  * warehouse_overview: per-warehouse stock summary (security_invoker)
-- =============================================================================

create or replace function public.update_product(
  p_product_id uuid,
  p_product    jsonb,
  p_variants   jsonb,
  p_shop_ids   uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_status  public.product_status;
  v_variant jsonb;
  v_keep    uuid[] := '{}';
  v_id      uuid;
begin
  select organization_id into v_org from public.products where id = p_product_id;
  if v_org is null then
    raise exception 'Product not found' using errcode = 'no_data_found';
  end if;
  if not private.has_org_role(v_org, array['owner', 'admin', 'manager']::public.org_role[]) then
    raise exception 'Not allowed to edit products' using errcode = '42501';
  end if;
  if jsonb_typeof(p_variants) <> 'array' or jsonb_array_length(p_variants) = 0 then
    raise exception 'A product needs at least one variant' using errcode = 'check_violation';
  end if;

  v_status := coalesce((p_product ->> 'status')::public.product_status, 'draft');

  update public.products
  set title       = p_product ->> 'title',
      slug        = p_product ->> 'slug',
      description = nullif(p_product ->> 'description', ''),
      status      = v_status,
      attributes  = coalesce(p_product -> 'attributes', '{}'::jsonb),
      tags        = coalesce(array(select jsonb_array_elements_text(p_product -> 'tags')), '{}'),
      hsn_code    = nullif(p_product ->> 'hsn_code', ''),
      gst_rate    = nullif(p_product ->> 'gst_rate', '')::numeric
  where id = p_product_id;

  -- Deactivate variants that are no longer listed first, so a re-added
  -- combination doesn't collide with the unique active-options index.
  select coalesce(array_agg((v ->> 'id')::uuid), '{}') into v_keep
  from jsonb_array_elements(p_variants) v
  where nullif(v ->> 'id', '') is not null;

  update public.product_variants
  set is_active = false
  where product_id = p_product_id and is_active and not (id = any (v_keep));

  for v_variant in select * from jsonb_array_elements(p_variants) loop
    v_id := nullif(v_variant ->> 'id', '')::uuid;
    if v_id is not null then
      update public.product_variants
      set sku              = v_variant ->> 'sku',
          title            = coalesce(nullif(v_variant ->> 'title', ''), title),
          price            = (v_variant ->> 'price')::numeric,
          compare_at_price = nullif(v_variant ->> 'compare_at_price', '')::numeric,
          cost_price       = nullif(v_variant ->> 'cost_price', '')::numeric,
          barcode          = nullif(v_variant ->> 'barcode', ''),
          is_active        = coalesce((v_variant ->> 'is_active')::boolean, true)
      where id = v_id and product_id = p_product_id;
      if not found then
        raise exception 'Variant does not belong to this product' using errcode = 'check_violation';
      end if;
    else
      insert into public.product_variants (
        organization_id, product_id, sku, title, options, price, compare_at_price, cost_price, barcode
      ) values (
        v_org, p_product_id,
        v_variant ->> 'sku',
        coalesce(nullif(v_variant ->> 'title', ''), 'Default'),
        coalesce(v_variant -> 'options', '{}'::jsonb),
        (v_variant ->> 'price')::numeric,
        nullif(v_variant ->> 'compare_at_price', '')::numeric,
        nullif(v_variant ->> 'cost_price', '')::numeric,
        nullif(v_variant ->> 'barcode', '')
      );
    end if;
  end loop;

  if not exists (select 1 from public.product_variants where product_id = p_product_id and is_active) then
    raise exception 'A product needs at least one active variant' using errcode = 'check_violation';
  end if;

  delete from public.shop_products
  where product_id = p_product_id and not (shop_id = any (coalesce(p_shop_ids, '{}')));

  insert into public.shop_products (organization_id, shop_id, product_id, is_published, published_at)
  select v_org, s, p_product_id, v_status = 'active', case when v_status = 'active' then now() end
  from unnest(coalesce(p_shop_ids, '{}')) s
  on conflict (shop_id, product_id) do update
    set is_published = excluded.is_published,
        published_at = case
          when excluded.is_published and not public.shop_products.is_published then now()
          when not excluded.is_published then null
          else public.shop_products.published_at
        end;

  perform private.log_audit(v_org, 'product.updated', 'product', p_product_id,
    jsonb_build_object('variants', jsonb_array_length(p_variants), 'shops', cardinality(coalesce(p_shop_ids, '{}'))));
end;
$$;

revoke all on function public.update_product(uuid, jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.update_product(uuid, jsonb, jsonb, uuid[]) to authenticated;

create or replace function public.set_warehouse_shops(p_warehouse_id uuid, p_shop_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.warehouses where id = p_warehouse_id;
  if v_org is null then
    raise exception 'Warehouse not found' using errcode = 'no_data_found';
  end if;
  if not private.has_org_role(v_org, array['owner', 'admin', 'manager']::public.org_role[]) then
    raise exception 'Not allowed to manage warehouses' using errcode = '42501';
  end if;

  delete from public.shop_warehouses
  where warehouse_id = p_warehouse_id and not (shop_id = any (coalesce(p_shop_ids, '{}')));

  insert into public.shop_warehouses (organization_id, shop_id, warehouse_id, priority)
  select v_org, s, p_warehouse_id,
         coalesce((select max(priority) + 1 from public.shop_warehouses sw where sw.shop_id = s), 1)
  from unnest(coalesce(p_shop_ids, '{}')) s
  on conflict (shop_id, warehouse_id) do nothing;
end;
$$;

revoke all on function public.set_warehouse_shops(uuid, uuid[]) from public, anon;
grant execute on function public.set_warehouse_shops(uuid, uuid[]) to authenticated;

create view public.warehouse_overview
with (security_invoker = true) as
select
  w.id,
  w.organization_id,
  w.name,
  w.code,
  w.address,
  w.is_active,
  w.created_at,
  coalesce(st.units, 0)       as units_on_hand,
  coalesce(st.skus, 0)        as skus_in_stock,
  coalesce(st.low, 0)         as low_stock_skus,
  coalesce(sh.shop_ids, '{}') as shop_ids
from public.warehouses w
left join lateral (
  select sum(il.on_hand) as units,
         count(*) filter (where il.on_hand > 0) as skus,
         count(*) filter (where il.available <= il.reorder_point) as low
  from public.inventory_levels il where il.warehouse_id = w.id
) st on true
left join lateral (
  select array_agg(sw.shop_id order by sw.priority) as shop_ids
  from public.shop_warehouses sw where sw.warehouse_id = w.id
) sh on true;

revoke all on public.warehouse_overview from anon;
grant select on public.warehouse_overview to authenticated;

-- -----------------------------------------------------------------------------
-- Inactive warehouses keep their history and can still ship out what they hold,
-- but take in no new stock (receipts, positive adjustments, inbound transfers).
-- Customer returns are still accepted so goods are never stranded.
-- -----------------------------------------------------------------------------
create or replace function private.guard_inactive_warehouse()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.quantity > 0 and new.type <> 'return' and exists (
    select 1 from public.warehouses w where w.id = new.warehouse_id and not w.is_active
  ) then
    raise exception 'This warehouse is inactive and cannot receive stock'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger stock_movements_guard_inactive_warehouse
  before insert on public.stock_movements
  for each row execute function private.guard_inactive_warehouse();
