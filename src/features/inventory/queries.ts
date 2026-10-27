import "server-only";

import { cache } from "react";

import { type Tracking } from "@/features/inventory/schemas";
import { INVENTORY_PAGE_SIZE } from "@/features/inventory/search-params";
import { fromPostgrestError } from "@/lib/errors";
import { containsPattern, quoteFilterValue } from "@/lib/postgrest";
import { createClient } from "@/lib/supabase/server";

export type InventoryRow = {
  variantId: string;
  warehouseId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  tracking: Tracking;
  warehouseName: string;
  warehouseCode: string;
  onHand: number;
  reserved: number;
  available: number;
  reorderPoint: number;
  isLow: boolean;
  nextExpiry: string | null;
};

export type InventoryFilters = { q: string; warehouse: string | null; low: boolean; page: number };

export const listInventory = cache(async (organizationId: string, filters: InventoryFilters) => {
  const supabase = await createClient();
  const page = Math.max(1, filters.page);
  const from = (page - 1) * INVENTORY_PAGE_SIZE;

  let query = supabase
    .from("inventory_overview")
    .select(
      "variant_id, warehouse_id, product_id, product_title, variant_title, sku, tracking, warehouse_name, warehouse_code, on_hand, reserved, available, reorder_point, is_low, next_expiry",
      { count: "exact" },
    )
    .eq("organization_id", organizationId);

  const q = filters.q.trim().slice(0, 100);
  if (q) {
    const pattern = quoteFilterValue(containsPattern(q));
    query = query.or(`product_title.ilike.${pattern},sku.ilike.${pattern}`);
  }
  if (filters.warehouse) query = query.eq("warehouse_id", filters.warehouse);
  if (filters.low) query = query.eq("is_low", true);

  const { data, error, count } = await query
    .order("is_low", { ascending: false })
    .order("product_title")
    .order("sku")
    .order("warehouse_name")
    .range(from, from + INVENTORY_PAGE_SIZE - 1);
  if (error) throw fromPostgrestError(error);

  const total = count ?? 0;
  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / INVENTORY_PAGE_SIZE)),
    items: data.map((r): InventoryRow => ({
      variantId: r.variant_id,
      warehouseId: r.warehouse_id,
      productId: r.product_id,
      productTitle: r.product_title,
      variantTitle: r.variant_title,
      sku: r.sku,
      tracking: r.tracking,
      warehouseName: r.warehouse_name,
      warehouseCode: r.warehouse_code,
      onHand: r.on_hand,
      reserved: r.reserved,
      available: r.available ?? 0,
      reorderPoint: r.reorder_point,
      isLow: Boolean(r.is_low),
      nextExpiry: r.next_expiry,
    })),
  };
});

/** Headline numbers for the inventory page. */
export const getInventorySummary = cache(
  async (organizationId: string, today: string, soon: string) => {
    const supabase = await createClient();
    const [units, low, expiring] = await Promise.all([
      // One row per warehouse, already aggregated in the database.
      supabase
        .from("warehouse_overview")
        .select("units_on_hand")
        .eq("organization_id", organizationId),
      supabase
        .from("inventory_overview")
        .select("variant_id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("is_low", true),
      supabase
        .from("inventory_batches")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gt("on_hand", 0)
        .gte("expiry_date", today)
        .lte("expiry_date", soon),
    ]);
    for (const r of [units, low, expiring]) if (r.error) throw fromPostgrestError(r.error);

    return {
      unitsOnHand: (units.data ?? []).reduce((sum, r) => sum + Number(r.units_on_hand ?? 0), 0),
      lowStock: low.count ?? 0,
      expiringBatches: expiring.count ?? 0,
    };
  },
);
