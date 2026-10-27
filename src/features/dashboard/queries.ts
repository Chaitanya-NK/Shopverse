import "server-only";

import { z } from "zod";

import { fromPostgrestError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const statsSchema = z.object({
  orders_24h: z.coerce.number(),
  revenue_24h: z.coerce.number(),
  orders_to_fulfil: z.coerce.number(),
  low_stock_skus: z.coerce.number(),
  shipments_in_transit: z.coerce.number(),
  skus_in_stock: z.coerce.number(),
  active_products: z.coerce.number(),
  warehouses: z.coerce.number(),
});

export type OverviewStats = z.infer<typeof statsSchema>;

/** Overview card numbers in one round trip. RLS applies inside the function. */
export async function getOverviewStats(
  organizationId: string,
  shopId?: string | null,
): Promise<OverviewStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_overview_stats", {
    p_organization_id: organizationId,
    p_shop_id: shopId ?? undefined,
  });

  if (error) throw fromPostgrestError(error);
  return statsSchema.parse(data);
}
