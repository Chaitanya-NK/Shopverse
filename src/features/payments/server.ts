import "server-only";

import { notifyOrder } from "@/features/notifications/order-notifier";
import { routes } from "@/config/routes";
import { env } from "@/env";
import { AppError, Errors, fromPostgrestError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  fromPaise,
  idOf,
  stripe,
  type StripeCheckoutSession,
  type StripePaymentIntent,
  toPaise,
} from "@/lib/payments/stripe";
import { decryptSecret } from "@/lib/payments/secrets";
import { createAdminClient } from "@/lib/supabase/admin";

type Credentials = {
  accountId: string;
  secretKey: string;
  webhookSecret: string | null;
  enabled: boolean;
};

/** A business's Stripe keys, decrypted (server only). Null if not connected. */
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
    accountId: row.key_id,
    secretKey: decryptSecret(row.key_secret_enc),
    webhookSecret: row.webhook_secret_enc ? decryptSecret(row.webhook_secret_enc) : null,
    enabled: row.enabled,
  };
}

/** Stripe asks for at least 30 minutes before a Checkout Session may expire. */
const MIN_SESSION_SECONDS = 31 * 60;
const absolute = (path: string) => new URL(path, env.NEXT_PUBLIC_APP_URL).toString();

/**
 * Start Stripe Checkout for an order awaiting payment (a new session per
 * attempt). Returns the hosted page to send the shopper to.
 */
export async function startPayment(orderToken: string): Promise<{ url: string }> {
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

  const [credentials, shop] = await Promise.all([
    getCredentials(order.organization_id),
    admin.from("orders").select("shop:shops (slug)").eq("id", order.order_id).single(),
  ]);
  if (!credentials?.enabled)
    throw new AppError(
      "UNAVAILABLE",
      "Online payment isn't available right now. Please contact the shop.",
    );
  if (shop.error) throw fromPostgrestError(shop.error);
  const orderPage = absolute(routes.storefrontOrder(shop.data.shop!.slug, orderToken));

  const amount = Number(order.amount);
  const session = await stripe.createCheckoutSession(credentials.secretKey, {
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: order.currency.toLowerCase(),
          unit_amount: toPaise(amount),
          product_data: { name: `Order ${order.number}`, description: order.shop_name },
        },
      },
    ],
    customer_email: order.customer.email ?? undefined,
    client_reference_id: order.order_id,
    metadata: { shopverse_order_id: order.order_id, order_number: order.number },
    payment_intent_data: {
      description: `${order.shop_name} order ${order.number}`,
      metadata: { shopverse_order_id: order.order_id, order_number: order.number },
    },
    // Stock is held until the order's due time; a late payment is refunded.
    expires_at: Math.floor(Date.now() / 1000) + MIN_SESSION_SECONDS,
    success_url: `${orderPage}?checkout={CHECKOUT_SESSION_ID}`,
    cancel_url: `${orderPage}?checkout=cancelled`,
  });
  if (!session.url) throw new AppError("UNAVAILABLE", "Stripe didn't return a payment page.");

  const { error: recordError } = await admin.rpc("record_payment_attempt", {
    p_order_id: order.order_id,
    p_provider_order_id: session.id,
    p_amount: amount,
    p_currency: order.currency,
  });
  if (recordError) throw fromPostgrestError(recordError);
  return { url: session.url };
}

type CaptureResult =
  "confirmed" | "already_recorded" | "duplicate" | "order_closed" | "amount_mismatch" | "unknown";

/**
 * Record a paid Checkout Session (from the return page or a webhook). Sends
 * the confirmation email the first time, and refunds money that can't be kept.
 */
export async function settleCapture(input: {
  sessionId: string;
  paymentIntentId: string;
  amount: number;
  method: string | null;
}): Promise<{ result: CaptureResult; orderId: string | null }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("record_payment_captured", {
    p_provider_order_id: input.sessionId,
    p_provider_payment_id: input.paymentIntentId,
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

/** What a session's payment was made with ("card", "upi", …). */
function methodOf(session: StripeCheckoutSession) {
  const pi = session.payment_intent as StripePaymentIntent | string | null;
  const charge = typeof pi === "object" && pi ? pi.latest_charge : null;
  return (typeof charge === "object" && charge?.payment_method_details?.type) || null;
}

/**
 * Settle a Checkout Session from Stripe's own record of it (never the
 * browser's word). Unpaid sessions are reported, not recorded.
 */
export async function settleSession(secretKey: string, sessionId: string) {
  const session = await stripe.retrieveCheckoutSession(secretKey, sessionId, [
    "payment_intent.latest_charge",
  ]);
  const paymentIntentId = idOf(session.payment_intent);
  if (session.payment_status !== "paid" || !paymentIntentId) return { result: "unpaid" as const };
  return settleCapture({
    sessionId: session.id,
    paymentIntentId,
    amount: fromPaise(session.amount_total ?? 0),
    method: methodOf(session),
  });
}

/** The shopper is back from Stripe Checkout: confirm the order if it was paid. */
export async function completePayment(input: { orderToken: string; sessionId: string }) {
  const admin = createAdminClient();
  const { data: attempt, error } = await admin
    .from("payments")
    .select("organization_id, order:orders!inner (public_token)")
    .eq("provider_order_id", input.sessionId)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  // The session must belong to this order's link.
  if (!attempt || attempt.order.public_token !== input.orderToken) throw Errors.notFound("Payment");
  const credentials = await getCredentials(attempt.organization_id);
  if (!credentials) throw new AppError("UNAVAILABLE", "Online payment isn't available right now.");
  return settleSession(credentials.secretKey, input.sessionId);
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
      const refund = await stripe.createRefund(
        credentials.secretKey,
        {
          paymentIntent: item.provider_payment_id,
          amount: Number(item.amount),
          metadata: { shopverse_order_id: orderId },
        },
        // A retry of the same refund can't pay twice.
        `refund-${item.payment_id}-${toPaise(Number(item.amount))}`,
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
