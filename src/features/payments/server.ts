import "server-only";

import { notifyOrder } from "@/features/notifications/order-notifier";
import { AppError, Errors, fromPostgrestError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  fromPaise,
  razorpay,
  type RazorpayCredentials,
  verifyPaymentSignature,
} from "@/lib/payments/razorpay";
import { decryptSecret } from "@/lib/payments/secrets";
import { createAdminClient } from "@/lib/supabase/admin";

type Credentials = RazorpayCredentials & { webhookSecret: string | null; enabled: boolean };

/** A business's Razorpay keys, decrypted (server only). Null if not connected. */
export async function getCredentials(organizationId: string): Promise<Credentials | null> {
  const { data, error } = await createAdminClient().rpc("payment_account_credentials", {
    p_organization_id: organizationId,
  });
  if (error) throw fromPostgrestError(error);
  if (!data) return null;
  const row = data as {
    key_id: string;
    key_secret_enc: string;
    webhook_secret_enc: string | null;
    enabled: boolean;
  };
  return {
    keyId: row.key_id,
    keySecret: decryptSecret(row.key_secret_enc),
    webhookSecret: row.webhook_secret_enc ? decryptSecret(row.webhook_secret_enc) : null,
    enabled: row.enabled,
  };
}

export type CheckoutSession = {
  keyId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  shopName: string;
  description: string;
  dueAt: string;
  prefill: { name?: string; email?: string; contact?: string };
};

/** Create a Razorpay order for an order awaiting payment (a new one per attempt). */
export async function startPayment(orderToken: string): Promise<CheckoutSession> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("begin_online_payment", { p_order_token: orderToken });
  if (error) throw fromPostgrestError(error);
  const order = data as
    | { expired: true }
    | {
        expired?: undefined;
        order_id: string;
        organization_id: string;
        number: string;
        amount: number;
        currency: string;
        due_at: string;
        shop_name: string;
        customer: { name: string | null; email: string | null; phone: string | null };
      };
  if (order.expired)
    throw Errors.validation(
      {},
      "The time to pay ran out, so this order was cancelled. Please order again.",
    );

  const credentials = await getCredentials(order.organization_id);
  if (!credentials?.enabled)
    throw new AppError(
      "UNAVAILABLE",
      "Online payment isn't available right now. Please contact the shop.",
    );

  const amount = Number(order.amount);
  const created = await razorpay.createOrder(credentials, {
    amount,
    currency: order.currency,
    receipt: order.number,
    notes: { shopverse_order_id: order.order_id, order_number: order.number },
  });
  const { error: recordError } = await admin.rpc("record_payment_attempt", {
    p_order_id: order.order_id,
    p_provider_order_id: created.id,
    p_amount: amount,
    p_currency: order.currency,
  });
  if (recordError) throw fromPostgrestError(recordError);

  return {
    keyId: credentials.keyId,
    razorpayOrderId: created.id,
    amountPaise: created.amount,
    currency: created.currency,
    shopName: order.shop_name,
    description: `Order ${order.number}`,
    dueAt: order.due_at,
    prefill: {
      name: order.customer.name ?? undefined,
      email: order.customer.email ?? undefined,
      contact: order.customer.phone ?? undefined,
    },
  };
}

type CaptureResult =
  "confirmed" | "already_recorded" | "duplicate" | "order_closed" | "amount_mismatch" | "unknown";

/**
 * Record a captured payment (from the checkout callback or a webhook). Sends
 * the confirmation email the first time, and refunds money that can't be kept.
 */
export async function settleCapture(input: {
  razorpayOrderId: string;
  paymentId: string;
  amount: number;
  method: string | null;
}): Promise<{ result: CaptureResult; orderId: string | null }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("record_payment_captured", {
    p_provider_order_id: input.razorpayOrderId,
    p_provider_payment_id: input.paymentId,
    p_amount: input.amount,
    p_method: input.method ?? "online",
  });
  if (error) throw fromPostgrestError(error);
  const outcome = data as { result: CaptureResult; order_id?: string };
  const orderId = outcome.order_id ?? null;
  if (outcome.result === "confirmed" && orderId) notifyOrder(orderId, { type: "confirmed" });
  if (["duplicate", "order_closed", "amount_mismatch"].includes(outcome.result) && orderId)
    await refundDuePayments(orderId);
  return { result: outcome.result, orderId };
}

/** Checkout success callback: verify the signature, then confirm with Razorpay itself. */
export async function completePayment(input: {
  razorpayOrderId: string;
  paymentId: string;
  signature: string;
}) {
  const admin = createAdminClient();
  const { data: attempt, error } = await admin
    .from("payments")
    .select("organization_id, amount, currency")
    .eq("provider_order_id", input.razorpayOrderId)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!attempt) throw Errors.notFound("Payment");

  const credentials = await getCredentials(attempt.organization_id);
  if (!credentials) throw new AppError("UNAVAILABLE", "Online payment isn't available right now.");
  if (
    !verifyPaymentSignature(credentials.keySecret, {
      orderId: input.razorpayOrderId,
      paymentId: input.paymentId,
      signature: input.signature,
    })
  )
    throw Errors.validation(
      {},
      "We couldn't verify this payment. If money was taken, it will be refunded.",
    );

  // Trust the server's view of the payment, not the browser's.
  let payment = await razorpay.fetchPayment(credentials, input.paymentId);
  if (payment.order_id !== input.razorpayOrderId)
    throw Errors.validation({}, "This payment belongs to a different order.");
  if (payment.status === "authorized")
    payment = await razorpay.capturePayment(
      credentials,
      payment.id,
      fromPaise(payment.amount),
      payment.currency,
    );
  if (payment.status !== "captured")
    throw Errors.validation(
      {},
      "The payment hasn't gone through yet. If money was taken, we'll update your order shortly.",
    );

  return settleCapture({
    razorpayOrderId: input.razorpayOrderId,
    paymentId: payment.id,
    amount: fromPaise(payment.amount),
    method: payment.method,
  });
}

/** Refund every captured amount an order no longer keeps. Returns what happened. */
export async function refundDuePayments(orderId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("payments_to_refund", { p_order_id: orderId });
  if (error) throw fromPostgrestError(error);
  const due = (data ?? []) as {
    payment_id: string;
    organization_id: string;
    provider_payment_id: string;
    amount: number;
  }[];

  let refunded = 0;
  let failed = 0;
  for (const item of due) {
    try {
      const credentials = await getCredentials(item.organization_id);
      if (!credentials) throw new Error("Payment account not connected");
      const refund = await razorpay.refund(
        credentials,
        item.provider_payment_id,
        Number(item.amount),
        {
          shopverse_order_id: orderId,
        },
      );
      const { error: recordError } = await admin.rpc("record_refund", {
        p_payment_id: item.payment_id,
        p_refund_id: refund.id,
        p_amount: fromPaise(refund.amount),
      });
      if (recordError) throw recordError;
      refunded += 1;
    } catch (cause) {
      failed += 1;
      logger.error({ err: cause, orderId, payment: item.provider_payment_id }, "Refund failed");
    }
  }
  return { refunded, failed };
}

/** Cancel online orders past their time to pay (also scheduled by pg_cron). */
export async function expireUnpaidOrders(organizationId?: string) {
  const { error } = await createAdminClient().rpc("expire_unpaid_orders", {
    p_organization_id: organizationId,
  });
  if (error) logger.warn({ err: error }, "Expiring unpaid orders failed");
}
