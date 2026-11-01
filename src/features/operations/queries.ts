import "server-only";

import { cache } from "react";

import { digestSchema } from "@/features/operations/digest";
import { fromPostgrestError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/** Today's digest as the business would get it (members only). */
export const getDigestPreview = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("operations_digest", {
    p_organization_id: organizationId,
  });
  if (error) throw fromPostgrestError(error);
  return digestSchema.parse(data);
});

/** Warehouses a courier can't pick up from yet (no PIN code or state). */
export const getWarehousesMissingAddress = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouses")
    .select("name, address, is_active")
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  if (error) throw fromPostgrestError(error);
  return data
    .filter((w) => {
      const a = (w.address ?? {}) as Record<string, unknown>;
      return !a.postalCode || !a.state;
    })
    .map((w) => w.name);
});
