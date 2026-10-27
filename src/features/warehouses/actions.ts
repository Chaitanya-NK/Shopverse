"use server";

import { refresh } from "next/cache";

import { authorizeOrganization } from "@/features/organizations/server";
import { createWarehouseSchema, updateWarehouseSchema } from "@/features/warehouses/schemas";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";
import { type ServerSupabaseClient } from "@/lib/supabase/server";

const FORBIDDEN = "Only owners, admins and managers can manage warehouses.";

export const createWarehouse = createAction({
  name: "warehouses.create",
  schema: createWarehouseSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "warehouses.manage",
      FORBIDDEN,
    );

    const { data, error } = await supabase
      .from("warehouses")
      .insert({
        organization_id: org.id,
        name: input.name,
        code: input.code,
        address: input.address,
        is_active: input.isActive,
      })
      .select("id")
      .single();
    if (error) throw fromPostgrestError(error, { conflictField: "code" });

    await setRouting(supabase, data.id, input.shopIds);
    refresh();
    return data;
  },
});

export const updateWarehouse = createAction({
  name: "warehouses.update",
  schema: updateWarehouseSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "warehouses.manage",
      FORBIDDEN,
    );

    const { data, error } = await supabase
      .from("warehouses")
      .update({
        name: input.name,
        code: input.code,
        address: input.address,
        is_active: input.isActive,
      })
      .eq("id", input.warehouseId)
      .eq("organization_id", org.id)
      .select("id")
      .maybeSingle();
    if (error) throw fromPostgrestError(error, { conflictField: "code" });
    if (!data) throw Errors.notFound("Warehouse");

    await setRouting(supabase, data.id, input.shopIds);
    refresh();
    return data;
  },
});

async function setRouting(supabase: ServerSupabaseClient, warehouseId: string, shopIds: string[]) {
  const { error } = await supabase.rpc("set_warehouse_shops", {
    p_warehouse_id: warehouseId,
    p_shop_ids: shopIds,
  });
  if (error) throw fromPostgrestError(error);
}
