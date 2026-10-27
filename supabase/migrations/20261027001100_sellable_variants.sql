-- =============================================================================
-- Shopverse · Migration 011 · Price and tax on variant_search (order entry)
-- New columns go at the end so the view can be replaced in place.
-- =============================================================================

create or replace view public.variant_search
with (security_invoker = true) as
select
  v.id,
  v.organization_id,
  v.sku,
  v.title       as variant_title,
  p.id          as product_id,
  p.title       as product_title,
  p.tracking,
  p.status      as product_status,
  lower(p.title || ' ' || v.sku || ' ' || v.title) as search_text,
  v.price,
  coalesce(p.gst_rate, c.gst_rate, 0) as gst_rate
from public.product_variants v
join public.products p on p.id = v.product_id
left join public.categories c on c.id = p.category_id
where v.is_active and p.status <> 'archived';
