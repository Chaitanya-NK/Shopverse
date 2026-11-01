import "server-only";

import { cache } from "react";

import { shipmentDocumentSchema } from "@/features/shipping/schemas";
import { fromPostgrestError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/** Everything a packing slip or label needs (null if not found or not allowed). */
export const getShipmentDocument = cache(async (shipmentId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("shipment_document", { p_shipment_id: shipmentId });
  if (error) throw fromPostgrestError(error);
  return data ? shipmentDocumentSchema.parse(data) : null;
});

export type OperationsSettings = {
  lowStockAlerts: boolean;
  dailyDigest: boolean;
  digestHour: number;
  recipientRoles: ("owner" | "admin" | "manager" | "staff" | "support")[];
  courier: "test" | null;
  lastDigestOn: string | null;
};

export const getOperationsSettings = cache(
  async (organizationId: string): Promise<OperationsSettings> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_operations_settings", {
      p_organization_id: organizationId,
    });
    if (error) throw fromPostgrestError(error);
    const s = (data ?? {}) as Record<string, unknown>;
    return {
      lowStockAlerts: s.low_stock_alerts !== false,
      dailyDigest: s.daily_digest !== false,
      digestHour: typeof s.digest_hour === "number" ? s.digest_hour : 8,
      recipientRoles: Array.isArray(s.recipient_roles)
        ? (s.recipient_roles as OperationsSettings["recipientRoles"])
        : ["owner", "admin", "manager"],
      courier: s.courier === "test" ? "test" : null,
      lastDigestOn: typeof s.last_digest_on === "string" ? s.last_digest_on : null,
    };
  },
);

/** Product weights in grams, by variant (variants without one are left out). */
export async function getVariantWeights(lines: { variantId: string | null }[]) {
  const ids = [...new Set(lines.map((l) => l.variantId).filter((v): v is string => Boolean(v)))];
  if (ids.length === 0) return new Map<string, number>();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_variants")
    .select("id, weight_grams")
    .in("id", ids);
  if (error) throw fromPostgrestError(error);
  return new Map(
    data.filter((v) => v.weight_grams !== null).map((v) => [v.id, v.weight_grams as number]),
  );
}
