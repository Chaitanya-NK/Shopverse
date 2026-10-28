"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { authorizeOrganization } from "@/features/organizations/server";
import { slugSchema } from "@/features/organizations/schemas";
import { paymentSettingsSchema } from "@/features/payments/schemas";
import {
  completePayment,
  getCredentials,
  refundDuePayments,
  startPayment,
} from "@/features/payments/server";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";
import { razorpay } from "@/lib/payments/razorpay";
import { encryptSecret } from "@/lib/payments/secrets";

const orderToken = z.string().regex(/^[0-9a-f]{32}$/);

// ---------------------------------------------------------------------------
// Shoppers (by the order's private link)
// ---------------------------------------------------------------------------

export const startOnlinePayment = createAction({
  name: "payments.start",
  schema: z.object({ orderToken }),
  requireAuth: false,
  handler: async (input) => startPayment(input.orderToken),
});

export const verifyOnlinePayment = createAction({
  name: "payments.verify",
  schema: z.object({
    razorpayOrderId: z.string().min(5).max(64),
    razorpayPaymentId: z.string().min(5).max(64),
    razorpaySignature: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  requireAuth: false,
  handler: async (input) => {
    const { result } = await completePayment({
      razorpayOrderId: input.razorpayOrderId,
      paymentId: input.razorpayPaymentId,
      signature: input.razorpaySignature,
    });
    refresh();
    return { result };
  },
});

// ---------------------------------------------------------------------------
// Owners and admins
// ---------------------------------------------------------------------------

export const savePaymentSettings = createAction({
  name: "payments.saveSettings",
  schema: paymentSettingsSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "payments.manage",
      "Only owners and admins can connect payments.",
    );

    // Check the keys with Razorpay before storing them.
    const existing = input.keySecret ? null : await getCredentials(org.id);
    const keySecret = input.keySecret || existing?.keySecret;
    if (!keySecret) throw Errors.validation({ keySecret: ["Enter the key secret"] });
    await razorpay.checkCredentials({ keyId: input.keyId, keySecret });

    const { error } = await supabase.rpc("save_payment_account", {
      p_organization_id: org.id,
      p_key_id: input.keyId,
      p_key_secret_enc: input.keySecret ? encryptSecret(input.keySecret) : undefined,
      p_webhook_secret_enc: input.webhookSecret ? encryptSecret(input.webhookSecret) : undefined,
      p_enabled: input.enabled,
    });
    if (error) throw fromPostgrestError(error);
    refresh();
    return { mode: input.keyId.startsWith("rzp_live_") ? "live" : "test" };
  },
});

export const disconnectPayments = createAction({
  name: "payments.disconnect",
  schema: z.object({ organizationSlug: slugSchema }),
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "payments.manage",
      "Only owners and admins can disconnect payments.",
    );
    const { error } = await supabase.rpc("disconnect_payment_account", {
      p_organization_id: org.id,
    });
    if (error) throw fromPostgrestError(error);
    refresh();
    return null;
  },
});

/** Staff: try again to refund what an order owes (e.g. after a Razorpay outage). */
export const retryRefunds = createAction({
  name: "payments.retryRefunds",
  schema: z.object({ organizationSlug: slugSchema, orderId: z.uuid() }),
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "orders.cancel",
      "Only owners, admins and managers can refund.",
    );
    const { data, error } = await supabase
      .from("orders")
      .select("id")
      .eq("id", input.orderId)
      .eq("organization_id", org.id)
      .maybeSingle();
    if (error) throw fromPostgrestError(error);
    if (!data) throw Errors.notFound("Order");
    const result = await refundDuePayments(data.id);
    refresh();
    return result;
  },
});
