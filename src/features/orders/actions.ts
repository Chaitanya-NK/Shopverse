"use server";

import { refresh } from "next/cache";

import {
  cancelOrderSchema,
  confirmDeliverySchema,
  createOrderSchema,
  createShipmentSchema,
  orderActionSchema,
  sellableSearchSchema,
  updateOrderNotesSchema,
  updateShipmentStatusSchema,
} from "@/features/orders/schemas";
import { type Tracking } from "@/features/inventory/schemas";
import { authorizeOrganization } from "@/features/organizations/server";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";
import { containsPattern } from "@/lib/postgrest";

const ORDERS_FORBIDDEN = "You don't have permission to manage orders.";

export const createOrder = createAction({
  name: "orders.create",
  schema: createOrderSchema,
  handler: async (input, { supabase, user }) => {
    await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "orders.manage",
      ORDERS_FORBIDDEN,
    );

    const { data, error } = await supabase.rpc("create_order", {
      p_shop_id: input.shopId,
      p_customer: {
        full_name: input.customer.fullName || input.address.name,
        email: input.customer.email || null,
        phone: input.customer.phone ?? input.address.phone,
      },
      p_address: {
        name: input.address.name,
        phone: input.address.phone,
        line1: input.address.line1,
        line2: input.address.line2,
        city: input.address.city,
        state: input.address.state,
        postal_code: input.address.postalCode,
        country: "IN",
      },
      p_items: input.lines.map((l) => ({
        variant_id: l.variantId,
        quantity: l.quantity,
        unit_price: l.unitPrice,
      })),
      p_payment_method: input.paymentMethod,
      p_payment_status: input.paid ? "paid" : "pending",
      p_shipping_total: input.shippingTotal,
      p_discount_total: input.discountTotal,
      p_notes: input.notes || undefined,
      p_confirm: input.confirm,
    });
    if (error) throw fromPostgrestError(error);

    refresh();
    return { id: data };
  },
});

export const confirmOrder = createAction({
  name: "orders.confirm",
  schema: orderActionSchema,
  handler: async (input, { supabase, user }) => {
    await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "orders.manage",
      ORDERS_FORBIDDEN,
    );
    const { error } = await supabase.rpc("confirm_order", { p_order_id: input.orderId });
    if (error) throw fromPostgrestError(error);
    refresh();
    return { ok: true };
  },
});

export const cancelOrder = createAction({
  name: "orders.cancel",
  schema: cancelOrderSchema,
  handler: async (input, { supabase, user }) => {
    await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "orders.cancel",
      "Only owners, admins and managers can cancel orders.",
    );
    const { error } = await supabase.rpc("cancel_order", {
      p_order_id: input.orderId,
      p_reason: input.reason || undefined,
    });
    if (error) throw fromPostgrestError(error);
    refresh();
    return { ok: true };
  },
});

export const markOrderPaid = createAction({
  name: "orders.markPaid",
  schema: orderActionSchema,
  handler: async (input, { supabase, user }) => {
    await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "orders.manage",
      ORDERS_FORBIDDEN,
    );
    const { error } = await supabase.rpc("mark_order_paid", { p_order_id: input.orderId });
    if (error) throw fromPostgrestError(error);
    refresh();
    return { ok: true };
  },
});

export const updateOrderNotes = createAction({
  name: "orders.updateNotes",
  schema: updateOrderNotesSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "orders.manage",
      ORDERS_FORBIDDEN,
    );
    const { data, error } = await supabase
      .from("orders")
      .update({ notes: input.notes || null })
      .eq("id", input.orderId)
      .eq("organization_id", org.id)
      .select("id")
      .maybeSingle();
    if (error) throw fromPostgrestError(error);
    if (!data) throw Errors.notFound("Order");
    refresh();
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Shipments
// ---------------------------------------------------------------------------

export const createShipment = createAction({
  name: "orders.createShipment",
  schema: createShipmentSchema,
  handler: async (input, { supabase, user }) => {
    await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "orders.manage",
      ORDERS_FORBIDDEN,
    );
    const { data, error } = await supabase.rpc("create_shipment", {
      p_order_id: input.orderId,
      p_warehouse_id: input.warehouseId,
      p_items: input.items
        .filter((i) => i.quantity > 0)
        .map((i) => ({ order_item_id: i.orderItemId, quantity: i.quantity, serials: i.serials })),
      p_carrier: input.carrier || undefined,
      p_tracking_number: input.trackingNumber || undefined,
      p_estimated_delivery: input.estimatedDelivery
        ? `${input.estimatedDelivery}T18:00:00+05:30`
        : undefined,
    });
    if (error) throw fromPostgrestError(error, { conflictField: "trackingNumber" });
    refresh();
    return { id: data };
  },
});

export const updateShipmentStatus = createAction({
  name: "orders.updateShipmentStatus",
  schema: updateShipmentStatusSchema,
  handler: async (input, { supabase, user }) => {
    await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "orders.manage",
      ORDERS_FORBIDDEN,
    );
    const { data, error } = await supabase.rpc("update_shipment_status", {
      p_shipment_id: input.shipmentId,
      p_status: input.status,
      p_description: input.description || undefined,
      p_location: input.location || undefined,
    });
    if (error) throw fromPostgrestError(error);
    refresh();
    // The delivery OTP is returned exactly once, when the parcel goes out.
    return { otp: data ?? null };
  },
});

export const confirmDelivery = createAction({
  name: "orders.confirmDelivery",
  schema: confirmDeliverySchema,
  handler: async (input, { supabase, user }) => {
    await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "orders.manage",
      ORDERS_FORBIDDEN,
    );
    const { data, error } = await supabase.rpc("confirm_delivery", {
      p_shipment_id: input.shipmentId,
      p_otp: input.otp,
    });
    if (error) throw fromPostgrestError(error);

    const result = (data ?? {}) as { ok?: boolean; attempts_left?: number; message?: string };
    if (!result.ok) {
      const left = typeof result.attempts_left === "number" ? result.attempts_left : null;
      throw Errors.validation({
        otp: [
          left === null
            ? (result.message ?? "That code can't be used")
            : left > 0
              ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.`
              : "That code is not right, and the code is now locked. Send the parcel out again for a new one.",
        ],
      });
    }
    refresh();
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Product search for order entry: price, tax and stock in the shop's warehouses
// ---------------------------------------------------------------------------

export type SellableVariant = {
  id: string;
  sku: string;
  title: string;
  productTitle: string;
  tracking: Tracking;
  price: number;
  gstRate: number;
  available: number;
};

export const searchSellableVariants = createAction({
  name: "orders.searchVariants",
  schema: sellableSearchSchema,
  handler: async (input, { supabase, user }): Promise<SellableVariant[]> => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "orders.manage",
      ORDERS_FORBIDDEN,
    );

    let query = supabase
      .from("variant_search")
      .select("id, sku, variant_title, product_title, tracking, price, gst_rate")
      .eq("organization_id", org.id)
      .eq("product_status", "active");
    if (input.query) query = query.ilike("search_text", containsPattern(input.query.toLowerCase()));
    const { data: variants, error } = await query.order("product_title").order("sku").limit(20);
    if (error) throw fromPostgrestError(error);
    if (variants.length === 0) return [];

    const { data: links, error: linkError } = await supabase
      .from("shop_warehouses")
      .select(
        "warehouse_id, warehouse:warehouses!shop_warehouses_organization_id_warehouse_id_fkey!inner (is_active)",
      )
      .eq("shop_id", input.shopId)
      .eq("warehouse.is_active", true);
    if (linkError) throw fromPostgrestError(linkError);

    const warehouseIds = links.map((l) => l.warehouse_id);
    const available = new Map<string, number>();
    if (warehouseIds.length > 0) {
      const { data: levels, error: levelError } = await supabase
        .from("inventory_levels")
        .select("variant_id, available")
        .in(
          "variant_id",
          variants.map((v) => v.id),
        )
        .in("warehouse_id", warehouseIds);
      if (levelError) throw fromPostgrestError(levelError);
      for (const l of levels)
        available.set(l.variant_id, (available.get(l.variant_id) ?? 0) + (l.available ?? 0));
    }

    return variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      title: v.variant_title,
      productTitle: v.product_title,
      tracking: v.tracking,
      price: v.price,
      gstRate: v.gst_rate ?? 0,
      available: available.get(v.id) ?? 0,
    }));
  },
});
