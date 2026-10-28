"use server";

import { refresh } from "next/cache";

import { notifyOrder, notifyReturn } from "@/features/notifications/order-notifier";
import { can } from "@/features/organizations/permissions";
import { authorizeOrganization } from "@/features/organizations/server";
import { refundReturnToOriginal } from "@/features/returns/refunds";
import {
  cancelReturnSchema,
  manualRefundSchema,
  receiveReturnSchema,
  requestReturnSchema,
  returnRefSchema,
  reviewReturnSchema,
  staffReturnSchema,
  toReturnItemsJson,
} from "@/features/returns/schemas";
import { clearShopperToken, requireShopperToken } from "@/features/shopper/session";
import { getStorefrontShop } from "@/features/storefront/queries";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ServerSupabaseClient } from "@/lib/supabase/server";

const FORBIDDEN = "You don't have permission to handle returns.";
const FORBIDDEN_REFUND = "Only owners, admins and managers can refund customers.";

// ---------------------------------------------------------------------------
// Shoppers
// ---------------------------------------------------------------------------

async function requireShop(slug: string) {
  const shop = await getStorefrontShop(slug);
  if (!shop) throw Errors.notFound("Shop");
  return shop;
}

async function shopperCall<T>(
  shopSlug: string,
  call: () => PromiseLike<{ data: T; error: Parameters<typeof fromPostgrestError>[0] | null }>,
) {
  const { data, error } = await call();
  if (error) {
    if (error.code === "42501") {
      await clearShopperToken(shopSlug);
      throw Errors.unauthenticated();
    }
    throw fromPostgrestError(error);
  }
  return data;
}

export const requestReturn = createAction({
  name: "returns.request",
  schema: requestReturnSchema,
  requireAuth: false,
  handler: async (input) => {
    const shop = await requireShop(input.shopSlug);
    const token = await requireShopperToken();
    const data = await shopperCall(input.shopSlug, () =>
      createAdminClient().rpc("shopper_request_return", {
        p_shop_id: shop.id,
        p_token: token,
        p_order_token: input.orderToken,
        p_items: toReturnItemsJson(input.lines, input.resolution),
        p_reason: input.reason,
        p_note: input.note,
        p_resolution: input.resolution,
        p_refund_upi: input.resolution === "refund" ? input.refundUpi : "",
      }),
    );
    const created = data as { id: string; number: string };
    notifyReturn(created.id, "requested");
    refresh();
    return { number: created.number };
  },
});

export const cancelReturnRequest = createAction({
  name: "returns.cancelRequest",
  schema: cancelReturnSchema,
  requireAuth: false,
  handler: async (input) => {
    const shop = await requireShop(input.shopSlug);
    const token = await requireShopperToken();
    await shopperCall(input.shopSlug, () =>
      createAdminClient().rpc("shopper_cancel_return", {
        p_shop_id: shop.id,
        p_token: token,
        p_return_id: input.returnId,
      }),
    );
    refresh();
    return null;
  },
});

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

async function authorize(
  supabase: ServerSupabaseClient,
  userId: string,
  organizationSlug: string,
  refund = false,
) {
  return authorizeOrganization(
    supabase,
    userId,
    organizationSlug,
    refund ? "returns.refund" : "returns.manage",
    refund ? FORBIDDEN_REFUND : FORBIDDEN,
  );
}

/** Return ids belong to the organisation in the URL (RLS checks access too). */
async function requireReturn(
  supabase: ServerSupabaseClient,
  organizationId: string,
  returnId: string,
) {
  const { data, error } = await supabase
    .from("returns")
    .select("id, order_id, resolution, refund_status")
    .eq("id", returnId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!data) throw Errors.notFound("Return");
  return data;
}

async function hasOnlinePayment(supabase: ServerSupabaseClient, orderId: string) {
  const { count, error } = await supabase
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId)
    .in("status", ["captured", "partially_refunded"]);
  if (error) throw fromPostgrestError(error);
  return (count ?? 0) > 0;
}

export const createStaffReturn = createAction({
  name: "returns.create",
  schema: staffReturnSchema,
  handler: async (input, { supabase, user }) => {
    await authorize(supabase, user.id, input.organizationSlug);
    const { data, error } = await supabase.rpc("create_return", {
      p_order_id: input.orderId,
      p_items: toReturnItemsJson(input.lines, input.resolution),
      p_reason: input.reason,
      p_note: input.note,
      p_resolution: input.resolution,
      p_refund_upi: input.refundUpi,
    });
    if (error) throw fromPostgrestError(error);
    refresh();
    return { returnId: data };
  },
});

export const reviewReturn = createAction({
  name: "returns.review",
  schema: reviewReturnSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorize(supabase, user.id, input.organizationSlug);
    await requireReturn(supabase, org.id, input.returnId);
    const { error } = await supabase.rpc("review_return", {
      p_return_id: input.returnId,
      p_approve: input.approve,
      p_note: input.note,
    });
    if (error) throw fromPostgrestError(error);
    notifyReturn(input.returnId, input.approve ? "approved" : "rejected");
    refresh();
    return null;
  },
});

export const markReturnPickedUp = createAction({
  name: "returns.pickedUp",
  schema: returnRefSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorize(supabase, user.id, input.organizationSlug);
    await requireReturn(supabase, org.id, input.returnId);
    const { error } = await supabase.rpc("mark_return_picked_up", { p_return_id: input.returnId });
    if (error) throw fromPostgrestError(error);
    refresh();
    return null;
  },
});

/**
 * Receive the parcel. When the order was paid online and the person may give
 * money back, the refund goes straight to the original payment.
 */
export const receiveReturn = createAction({
  name: "returns.receive",
  schema: receiveReturnSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorize(supabase, user.id, input.organizationSlug);
    const ret = await requireReturn(supabase, org.id, input.returnId);
    const { error } = await supabase.rpc("receive_return", {
      p_return_id: input.returnId,
      p_items: input.items.map((i) => ({
        return_item_id: i.returnItemId,
        restock: i.restock,
        serial_numbers: i.serialNumbers,
      })),
    });
    if (error) throw fromPostgrestError(error);
    notifyReturn(input.returnId, "received");

    let refund: "sent" | "failed" | "manual" | "none" = "none";
    const { data: after } = await supabase
      .from("returns")
      .select("refund_status")
      .eq("id", input.returnId)
      .single();
    if (after?.refund_status === "due") {
      if (can(org.role, "returns.refund") && (await hasOnlinePayment(supabase, ret.order_id))) {
        try {
          await refundReturnToOriginal(supabase, input.returnId);
          notifyReturn(input.returnId, "refunded");
          refund = "sent";
        } catch (cause) {
          logger.warn({ err: cause, returnId: input.returnId }, "Automatic return refund failed");
          refund = "failed";
        }
      } else {
        refund = "manual";
      }
    }
    refresh();
    return { refund };
  },
});

export const refundReturn = createAction({
  name: "returns.refund",
  schema: returnRefSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorize(supabase, user.id, input.organizationSlug, true);
    await requireReturn(supabase, org.id, input.returnId);
    const result = await refundReturnToOriginal(supabase, input.returnId);
    notifyReturn(input.returnId, "refunded");
    refresh();
    return result;
  },
});

export const recordManualRefund = createAction({
  name: "returns.recordRefund",
  schema: manualRefundSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorize(supabase, user.id, input.organizationSlug, true);
    await requireReturn(supabase, org.id, input.returnId);
    const { error } = await supabase.rpc("record_manual_refund", {
      p_return_id: input.returnId,
      p_method: input.method,
      p_reference: input.reference,
    });
    if (error) throw fromPostgrestError(error);
    notifyReturn(input.returnId, "refunded");
    refresh();
    return null;
  },
});

export const sendReplacement = createAction({
  name: "returns.sendReplacement",
  schema: returnRefSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorize(supabase, user.id, input.organizationSlug);
    await requireReturn(supabase, org.id, input.returnId);
    const { data, error } = await supabase.rpc("create_exchange_order", {
      p_return_id: input.returnId,
    });
    if (error) throw fromPostgrestError(error);
    notifyOrder(data, { type: "confirmed" });
    refresh();
    return { orderId: data };
  },
});
