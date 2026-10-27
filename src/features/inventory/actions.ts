"use server";

import { refresh } from "next/cache";

import {
  movementHistorySchema,
  receiveStockSchema,
  removeStockSchema,
  setReorderPointSchema,
  stockLocationSchema,
  transferStockSchema,
  type MovementType,
  type Tracking,
  variantSearchSchema,
} from "@/features/inventory/schemas";
import { authorizeOrganization } from "@/features/organizations/server";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";
import { containsPattern } from "@/lib/postgrest";

const STOCK_FORBIDDEN = "You don't have permission to change stock.";

// ---------------------------------------------------------------------------
// Stock changes (the database functions enforce tracking rules atomically)
// ---------------------------------------------------------------------------

export const receiveStock = createAction({
  name: "inventory.receive",
  schema: receiveStockSchema,
  handler: async (input, { supabase, user }) => {
    await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "inventory.adjust",
      STOCK_FORBIDDEN,
    );

    const { data, error } = await supabase.rpc("receive_stock", {
      p_variant_id: input.variantId,
      p_warehouse_id: input.warehouseId,
      p_type: input.type,
      p_note: input.note ?? undefined,
      ...(input.tracking === "serial"
        ? { p_serials: input.serials }
        : input.tracking === "batch"
          ? {
              p_quantity: input.quantity,
              p_batch_code: input.batchCode,
              p_expiry_date: input.expiryDate ?? undefined,
            }
          : { p_quantity: input.quantity }),
    });
    if (error)
      throw fromPostgrestError(error, {
        conflictField: input.tracking === "serial" ? "serials" : undefined,
      });

    refresh();
    return { onHand: data.on_hand };
  },
});

export const removeStock = createAction({
  name: "inventory.remove",
  schema: removeStockSchema,
  handler: async (input, { supabase, user }) => {
    await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "inventory.adjust",
      STOCK_FORBIDDEN,
    );

    const { data, error } = await supabase.rpc("remove_stock", {
      p_variant_id: input.variantId,
      p_warehouse_id: input.warehouseId,
      p_type: input.type,
      p_note: input.note ?? undefined,
      ...(input.tracking === "serial"
        ? { p_serials: input.serials }
        : input.tracking === "batch"
          ? { p_quantity: input.quantity, p_batch_id: input.batchId }
          : { p_quantity: input.quantity }),
    });
    if (error) throw fromPostgrestError(error);

    refresh();
    return { onHand: data.on_hand };
  },
});

export const transferStock = createAction({
  name: "inventory.transfer",
  schema: transferStockSchema,
  handler: async (input, { supabase, user }) => {
    await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "inventory.adjust",
      STOCK_FORBIDDEN,
    );

    const { data, error } = await supabase.rpc("transfer_stock", {
      p_variant_id: input.variantId,
      p_from_warehouse_id: input.fromWarehouseId,
      p_to_warehouse_id: input.toWarehouseId,
      p_note: input.note ?? undefined,
      ...(input.tracking === "serial"
        ? { p_serials: input.serials }
        : input.tracking === "batch"
          ? { p_quantity: input.quantity, p_batch_id: input.batchId }
          : { p_quantity: input.quantity }),
    });
    if (error) throw fromPostgrestError(error);

    refresh();
    return { transferId: data };
  },
});

export const setReorderPoint = createAction({
  name: "inventory.setReorderPoint",
  schema: setReorderPointSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "warehouses.manage",
      "Only owners, admins and managers can set reorder points.",
    );

    const { data, error } = await supabase
      .from("inventory_levels")
      .update({ reorder_point: input.reorderPoint })
      .eq("organization_id", org.id)
      .eq("variant_id", input.variantId)
      .eq("warehouse_id", input.warehouseId)
      .select("reorder_point")
      .maybeSingle();
    if (error) throw fromPostgrestError(error);
    if (!data) throw Errors.notFound("Stock location");

    refresh();
    return data;
  },
});

// ---------------------------------------------------------------------------
// Reads used by the stock dialogs (validated and authorised like writes)
// ---------------------------------------------------------------------------

export type VariantSearchResult = {
  id: string;
  sku: string;
  variantTitle: string;
  productTitle: string;
  tracking: Tracking;
};

export const searchVariants = createAction({
  name: "inventory.searchVariants",
  schema: variantSearchSchema,
  handler: async (input, { supabase, user }): Promise<VariantSearchResult[]> => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "inventory.adjust",
      STOCK_FORBIDDEN,
    );

    let query = supabase
      .from("variant_search")
      .select("id, sku, variant_title, product_title, tracking")
      .eq("organization_id", org.id);
    if (input.query) query = query.ilike("search_text", containsPattern(input.query.toLowerCase()));

    const { data, error } = await query.order("product_title").order("sku").limit(20);
    if (error) throw fromPostgrestError(error);

    return data.map((v) => ({
      id: v.id,
      sku: v.sku,
      variantTitle: v.variant_title,
      productTitle: v.product_title,
      tracking: v.tracking,
    }));
  },
});

export const listInStockSerials = createAction({
  name: "inventory.listSerials",
  schema: stockLocationSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "inventory.adjust",
      STOCK_FORBIDDEN,
    );
    const { data, error } = await supabase
      .from("inventory_serials")
      .select("serial_number, received_at")
      .eq("organization_id", org.id)
      .eq("variant_id", input.variantId)
      .eq("warehouse_id", input.warehouseId)
      .eq("status", "in_stock")
      .order("received_at")
      .limit(1000);
    if (error) throw fromPostgrestError(error);
    return data.map((s) => s.serial_number);
  },
});

export type BatchOption = { id: string; code: string; expiryDate: string | null; onHand: number };

export const listBatches = createAction({
  name: "inventory.listBatches",
  schema: stockLocationSchema,
  handler: async (input, { supabase, user }): Promise<BatchOption[]> => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "inventory.adjust",
      STOCK_FORBIDDEN,
    );
    const { data, error } = await supabase
      .from("inventory_batches")
      .select("id, batch_code, expiry_date, on_hand")
      .eq("organization_id", org.id)
      .eq("variant_id", input.variantId)
      .eq("warehouse_id", input.warehouseId)
      .gt("on_hand", 0)
      // FEFO: the batch expiring first is offered first.
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .order("received_at");
    if (error) throw fromPostgrestError(error);
    return data.map((b) => ({
      id: b.id,
      code: b.batch_code,
      expiryDate: b.expiry_date,
      onHand: b.on_hand,
    }));
  },
});

export type Movement = {
  id: number;
  type: MovementType;
  quantity: number;
  balanceAfter: number;
  warehouseName: string;
  note: string | null;
  serials: string[];
  batchCode: string | null;
  createdAt: string;
};

export const listMovements = createAction({
  name: "inventory.listMovements",
  schema: movementHistorySchema,
  handler: async (input, { supabase, user }): Promise<Movement[]> => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "inventory.adjust",
      STOCK_FORBIDDEN,
    );
    let query = supabase
      .from("stock_movements")
      .select(
        "id, type, quantity, balance_after, note, serial_numbers, created_at, warehouse:warehouses!stock_movements_organization_id_warehouse_id_fkey(name), batch:inventory_batches(batch_code)",
      )
      .eq("organization_id", org.id)
      .eq("variant_id", input.variantId);
    if (input.warehouseId) query = query.eq("warehouse_id", input.warehouseId);

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(100);
    if (error) throw fromPostgrestError(error);

    return data.map((m) => ({
      id: m.id,
      type: m.type,
      quantity: m.quantity,
      balanceAfter: m.balance_after,
      warehouseName: m.warehouse?.name ?? "",
      note: m.note,
      serials: m.serial_numbers ?? [],
      batchCode: m.batch?.batch_code ?? null,
      createdAt: m.created_at,
    }));
  },
});
