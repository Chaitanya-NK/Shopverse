import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export type RazorpayCredentials = { keyId: string; keySecret: string };

export type RazorpayOrder = { id: string; amount: number; currency: string; status: string };
export type RazorpayPayment = {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method: string | null;
  error_description: string | null;
};
export type RazorpayRefund = {
  id: string;
  amount: number;
  status: string;
  notes?: Record<string, string> | unknown[];
};

export type RazorpayPlan = {
  id: string;
  period: string;
  interval: number;
  item: { amount: number };
};
export type RazorpaySubscription = {
  id: string;
  plan_id: string;
  status:
    | "created"
    | "authenticated"
    | "active"
    | "pending"
    | "halted"
    | "cancelled"
    | "completed"
    | "expired";
  current_start: number | null;
  current_end: number | null;
  short_url?: string | null;
  notes?: Record<string, string> | unknown[];
  has_scheduled_changes?: boolean;
};

/** Rupees (2 decimals) -> paise, the unit Razorpay uses. */
export const toPaise = (amount: number) => Math.round(amount * 100);
export const fromPaise = (paise: number) => Math.round(paise) / 100;

function hmacHex(secret: string, message: string | Buffer) {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function safeEqualHex(expected: string, received: string) {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Checkout success callback: HMAC(order_id|payment_id) with the key secret. */
export function verifyPaymentSignature(
  keySecret: string,
  input: { orderId: string; paymentId: string; signature: string },
) {
  return safeEqualHex(hmacHex(keySecret, `${input.orderId}|${input.paymentId}`), input.signature);
}

/** Webhooks: HMAC of the raw body with the webhook secret. */
/** Checkout's signature for a subscription's first payment. */
export function verifySubscriptionSignature(
  keySecret: string,
  input: { subscriptionId: string; paymentId: string; signature: string },
) {
  return safeEqualHex(
    hmacHex(keySecret, `${input.paymentId}|${input.subscriptionId}`),
    input.signature,
  );
}

export function verifyWebhookSignature(webhookSecret: string, rawBody: string, signature: string) {
  return safeEqualHex(hmacHex(webhookSecret, rawBody), signature);
}

async function call<T>(
  credentials: RazorpayCredentials,
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${env.RAZORPAY_API_URL}/v1${path}`, {
      method,
      headers: {
        authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString("base64")}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (cause) {
    logger.error({ err: cause, path }, "Razorpay unreachable");
    throw new AppError("UNAVAILABLE", "The payment service didn't respond. Please try again.", {
      cause,
    });
  }
  const data = (await response.json().catch(() => ({}))) as {
    error?: { description?: string; code?: string };
  };
  if (!response.ok) {
    logger.warn({ status: response.status, path, error: data.error }, "Razorpay request failed");
    if (response.status === 401)
      throw new AppError(
        "VALIDATION",
        "Razorpay didn't accept these keys. Check the key id and secret.",
      );
    throw new AppError(
      "UNAVAILABLE",
      data.error?.description ?? "The payment service returned an error.",
    );
  }
  return data as T;
}

export const razorpay = {
  createOrder: (
    c: RazorpayCredentials,
    input: { amount: number; currency: string; receipt: string; notes: Record<string, string> },
  ) => call<RazorpayOrder>(c, "POST", "/orders", { ...input, amount: toPaise(input.amount) }),
  fetchPayment: (c: RazorpayCredentials, paymentId: string) =>
    call<RazorpayPayment>(c, "GET", `/payments/${encodeURIComponent(paymentId)}`),
  capturePayment: (c: RazorpayCredentials, paymentId: string, amount: number, currency: string) =>
    call<RazorpayPayment>(c, "POST", `/payments/${encodeURIComponent(paymentId)}/capture`, {
      amount: toPaise(amount),
      currency,
    }),
  refund: (
    c: RazorpayCredentials,
    paymentId: string,
    amount: number,
    notes: Record<string, string>,
  ) =>
    call<RazorpayRefund>(c, "POST", `/payments/${encodeURIComponent(paymentId)}/refund`, {
      amount: toPaise(amount),
      notes,
    }),
  /** Refunds already made on a payment (to reconcile before refunding again). */
  listRefunds: (c: RazorpayCredentials, paymentId: string) =>
    call<{ items: RazorpayRefund[] }>(
      c,
      "GET",
      `/payments/${encodeURIComponent(paymentId)}/refunds?count=100`,
    ),
  createPlan: (
    c: RazorpayCredentials,
    input: {
      period: "monthly" | "yearly";
      name: string;
      amount: number;
      notes: Record<string, string>;
    },
  ) =>
    call<RazorpayPlan>(c, "POST", "/plans", {
      period: input.period,
      interval: 1,
      item: { name: input.name, amount: toPaise(input.amount), currency: "INR" },
      notes: input.notes,
    }),
  createSubscription: (
    c: RazorpayCredentials,
    input: { planId: string; totalCount: number; notes: Record<string, string> },
  ) =>
    call<RazorpaySubscription>(c, "POST", "/subscriptions", {
      plan_id: input.planId,
      total_count: input.totalCount,
      customer_notify: 1,
      notes: input.notes,
    }),
  fetchSubscription: (c: RazorpayCredentials, id: string) =>
    call<RazorpaySubscription>(c, "GET", `/subscriptions/${encodeURIComponent(id)}`),
  /** Change the plan now (upgrades) or at the end of the paid period. */
  updateSubscription: (
    c: RazorpayCredentials,
    id: string,
    planId: string,
    when: "now" | "cycle_end",
  ) =>
    call<RazorpaySubscription>(c, "PATCH", `/subscriptions/${encodeURIComponent(id)}`, {
      plan_id: planId,
      schedule_change_at: when,
      customer_notify: 1,
    }),
  cancelSubscription: (c: RazorpayCredentials, id: string, atCycleEnd: boolean) =>
    call<RazorpaySubscription>(c, "POST", `/subscriptions/${encodeURIComponent(id)}/cancel`, {
      cancel_at_cycle_end: atCycleEnd ? 1 : 0,
    }),
  /** A cheap authenticated call, to check keys when they're saved. */
  checkCredentials: (c: RazorpayCredentials) => call<unknown>(c, "GET", "/orders?count=1"),
};
