import "server-only";

import { cache } from "react";

import { parseWarehouseAddress, type WarehouseAddress } from "@/features/warehouses/schemas";
import { fromPostgrestError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type WarehouseSummary = {
  id: string;
  name: string;
  code: string;
  address: WarehouseAddress;
  isActive: boolean;
  unitsOnHand: number;
  skusInStock: number;
  lowStockSkus: number;
  shopIds: string[];
};

/** Warehouses with a stock summary and the shops each one fulfils. */
export const listWarehouses = cache(async (organizationId: string): Promise<WarehouseSummary[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouse_overview")
    .select(
      "id, name, code, address, is_active, units_on_hand, skus_in_stock, low_stock_skus, shop_ids",
    )
    .eq("organization_id", organizationId)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw fromPostgrestError(error);

  return data.map((w) => ({
    id: w.id,
    name: w.name,
    code: w.code,
    address: parseWarehouseAddress(w.address),
    isActive: w.is_active,
    unitsOnHand: Number(w.units_on_hand ?? 0),
    skusInStock: Number(w.skus_in_stock ?? 0),
    lowStockSkus: Number(w.low_stock_skus ?? 0),
    shopIds: w.shop_ids ?? [],
  }));
});
