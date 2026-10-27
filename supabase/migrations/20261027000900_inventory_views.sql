-- =============================================================================
-- Shopverse · Migration 009 · Inventory screens
--  * variant_search: active variants with product title and tracking, for
--    pickers ("receive stock into…") — includes variants with no stock yet
-- =============================================================================

create view public.variant_search
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
  lower(p.title || ' ' || v.sku || ' ' || v.title) as search_text
from public.product_variants v
join public.products p on p.id = v.product_id
where v.is_active and p.status <> 'archived';

revoke all on public.variant_search from anon;
grant select on public.variant_search to authenticated;
