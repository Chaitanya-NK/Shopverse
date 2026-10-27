-- =============================================================================
-- Tradeloom · Migration 004 · Dashboard statistics
-- One round trip for the overview cards. SECURITY INVOKER: every count is
-- filtered by the caller's RLS policies, so restricted staff only see the
-- shops they have access to.
-- =============================================================================

create or replace function public.get_overview_stats(
  p_organization_id uuid,
  p_shop_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with scoped_orders as (
    select o.grand_total, o.placed_at, o.fulfillment_status, o.status
    from public.orders o
    where o.organization_id = p_organization_id
      and (p_shop_id is null or o.shop_id = p_shop_id)
  )
  select jsonb_build_object(
    'orders_24h',
      (select count(*) from scoped_orders where placed_at >= now() - interval '24 hours'),
    'revenue_24h',
      (select coalesce(sum(grand_total), 0) from scoped_orders
        where placed_at >= now() - interval '24 hours' and status <> 'cancelled'),
    'orders_to_fulfil',
      (select count(*) from scoped_orders
        where status = 'confirmed' and fulfillment_status in ('unfulfilled', 'partially_fulfilled')),
    'low_stock_skus',
      (select count(*) from public.inventory_levels il
        where il.organization_id = p_organization_id and il.available <= il.reorder_point),
    'shipments_in_transit',
      (select count(*) from public.shipments s
        join public.orders o on o.id = s.order_id
        where s.organization_id = p_organization_id
          and (p_shop_id is null or o.shop_id = p_shop_id)
          and s.status in ('picked_up', 'in_transit', 'out_for_delivery')),
    'skus_in_stock',
      (select count(*) from public.inventory_levels il
        where il.organization_id = p_organization_id and il.on_hand > 0),
    'active_products',
      (select count(*) from public.products p
        where p.organization_id = p_organization_id and p.status = 'active'),
    'warehouses',
      (select count(*) from public.warehouses w
        where w.organization_id = p_organization_id and w.is_active)
  );
$$;

revoke all on function public.get_overview_stats(uuid, uuid) from public, anon;
grant execute on function public.get_overview_stats(uuid, uuid) to authenticated;
