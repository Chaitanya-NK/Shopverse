import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * A small Stripe REST client (no SDK): form-encoded requests, a pinned API
 * version, and webhook signature checks. Used for both the businesses' own
 * Stripe accounts (shop checkout and refunds) and Shopverse's account (plans).
 */
export const STRIPE_API_VERSION = "2025-03-31.basil";

/** A secret or restricted key: sk_test_…, sk_live_…, rk_test_…, rk_live_… */
export const STRIPE_SECRET_KEY = /^(sk|rk)_(test|live)_[A-Za-z0-9]{10,247}$/;
export const STRIPE_WEBHOOK_SECRET = /^whsec_[A-Za-z0-9+/=]{10,200}$/;
export const keyMode = (secretKey: string): "test" | "live" =>
  /^(sk|rk)_live_/.test(secretKey) ? "live" : "test";

/** Rupees (2 decimals) -> paise, Stripe's unit for INR. */
export const toPaise = (amount: number) => Math.round(amount * 100);
export const fromPaise = (paise: number) => Math.round(paise) / 100;

export type StripeAccount = { id: string; settings?: { dashboard?: { display_name?: string } } };

export type StripeCheckoutSession = {
  id: string;
  object: "checkout.session";
  url: string | null;
  mode: "payment" | "subscription" | "setup";
  status: "open" | "complete" | "expired";
  payment_status: "paid" | "unpaid" | "no_payment_required";
  amount_total: number | null;
  currency: string | null;
  client_reference_id: string | null;
  metadata: Record<string, string> | null;
  customer: string | { id: string } | null;
  payment_intent: string | StripePaymentIntent | null;
  subscription: string | StripeSubscription | null;
};

export type StripePaymentIntent = {
  id: string;
  amount: number;
  amount_received: number;
  currency: string;
  status: string;
  latest_charge?: string | { id: string; payment_method_details?: { type?: string } } | null;
  last_payment_error?: { message?: string } | null;
};

export type StripeRefund = {
  id: string;
  amount: number;
  status: string;
  payment_intent: string | null;
  metadata: Record<string, string> | null;
};

export type StripePrice = { id: string; unit_amount: number | null };

export type StripeSubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

type Period = { current_period_start?: number | null; current_period_end?: number | null };

export type StripeSubscription = Period & {
  id: string;
  object: "subscription";
  status: StripeSubscriptionStatus;
  customer: string | { id: string };
  cancel_at_period_end: boolean;
  schedule: string | { id: string } | null;
  metadata: Record<string, string> | null;
  latest_invoice: string | StripeInvoice | null;
  items: { data: (Period & { id: string; price: { id: string } })[] };
};

export type StripeInvoice = {
  id: string;
  status: string | null;
  amount_paid: number;
  amount_due: number;
  hosted_invoice_url: string | null;
  billing_reason?: string | null;
  /** Before API 2025-03-31. */
  subscription?: string | { id: string } | null;
  /** From API 2025-03-31. */
  parent?: {
    subscription_details?: { subscription?: string | { id: string } | null } | null;
  } | null;
};

export type StripeSchedule = {
  id: string;
  phases: { start_date: number; end_date: number; items: { price: string | { id: string } }[] }[];
};

export const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : (value?.id ?? null);

/** The subscription's current period, wherever this API version keeps it. */
export function subscriptionPeriod(sub: StripeSubscription) {
  const item = sub.items.data[0];
  return {
    start: item?.current_period_start ?? sub.current_period_start ?? null,
    end: item?.current_period_end ?? sub.current_period_end ?? null,
  };
}

export const invoiceSubscriptionId = (invoice: StripeInvoice) =>
  idOf(invoice.subscription) ?? idOf(invoice.parent?.subscription_details?.subscription);

// ---------------------------------------------------------------------------
// Encoding and signatures
// ---------------------------------------------------------------------------

type FormValue = string | number | boolean | null | undefined | FormValue[] | FormObject;
type FormObject = { [key: string]: FormValue };

/** Stripe's form encoding: nested objects as a[b][c]=v, arrays as a[0]=v. Nulls are skipped. */
export function encodeForm(body: FormObject): string {
  const pairs: string[] = [];
  const walk = (prefix: string, value: FormValue) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) value.forEach((v, i) => walk(`${prefix}[${i}]`, v));
    else if (typeof value === "object")
      for (const [k, v] of Object.entries(value)) walk(prefix ? `${prefix}[${k}]` : k, v);
    else pairs.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
  };
  walk("", body);
  return pairs.join("&");
}

/**
 * Webhooks: the Stripe-Signature header is "t=<unix>,v1=<hex>[,v1=…]", where
 * v1 = HMAC-SHA256(secret, "<t>.<raw body>"). Old timestamps are rejected so a
 * captured request can't be replayed.
 */
export function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  header: string,
  { toleranceSeconds = 300, now = Date.now() } = {},
): boolean {
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v ?? "");
  if (!t || !/^\d+$/.test(t) || signatures.length === 0) return false;
  if (Math.abs(now / 1000 - Number(t)) > toleranceSeconds) return false;
  const expected = Buffer.from(
    createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"),
  );
  return signatures.some((s) => {
    const received = Buffer.from(s);
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

/** Build a header Stripe would send (for tests and the local stand-in). */
export function signWebhook(
  secret: string,
  rawBody: string,
  timestamp = Math.floor(Date.now() / 1000),
) {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

async function call<T>(
  secretKey: string,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: FormObject,
  { idempotencyKey }: { idempotencyKey?: string } = {},
): Promise<T> {
  const form = body ? encodeForm(body) : "";
  const url = `${env.STRIPE_API_URL}/v1${path}${method === "GET" && form ? `?${form}` : ""}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${secretKey}`,
        "stripe-version": STRIPE_API_VERSION,
        ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      body: method === "POST" ? form : undefined,
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch (cause) {
    logger.error({ err: cause, path }, "Stripe unreachable");
    throw new AppError("UNAVAILABLE", "The payment service didn't respond. Please try again.", {
      cause,
    });
  }
  const data = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; type?: string; code?: string };
  };
  if (!response.ok) {
    logger.warn({ status: response.status, path, error: data.error }, "Stripe request failed");
    if (response.status === 401)
      throw new AppError(
        "VALIDATION",
        "Stripe didn't accept this secret key. Check it and try again.",
      );
    throw new AppError(
      "UNAVAILABLE",
      data.error?.message ?? "The payment service returned an error.",
    );
  }
  return data as T;
}

const enc = encodeURIComponent;

export const stripe = {
  /** The account a key belongs to; also checks the key works. */
  retrieveAccount: (key: string) => call<StripeAccount>(key, "GET", "/account"),

  createCheckoutSession: (key: string, body: FormObject, idempotencyKey?: string) =>
    call<StripeCheckoutSession>(key, "POST", "/checkout/sessions", body, { idempotencyKey }),
  retrieveCheckoutSession: (key: string, id: string, expand: string[] = []) =>
    call<StripeCheckoutSession>(key, "GET", `/checkout/sessions/${enc(id)}`, { expand }),
  expireCheckoutSession: (key: string, id: string) =>
    call<StripeCheckoutSession>(key, "POST", `/checkout/sessions/${enc(id)}/expire`),

  createRefund: (
    key: string,
    input: { paymentIntent: string; amount: number; metadata: Record<string, string> },
    idempotencyKey?: string,
  ) =>
    call<StripeRefund>(
      key,
      "POST",
      "/refunds",
      {
        payment_intent: input.paymentIntent,
        amount: toPaise(input.amount),
        metadata: input.metadata,
      },
      { idempotencyKey },
    ),
  /** Refunds already made on a payment (to reconcile before refunding again). */
  listRefunds: (key: string, paymentIntent: string) =>
    call<{ data: StripeRefund[] }>(key, "GET", "/refunds", {
      payment_intent: paymentIntent,
      limit: 100,
    }),

  createPrice: (
    key: string,
    input: {
      amount: number;
      interval: "month" | "year";
      name: string;
      metadata: Record<string, string>;
    },
  ) =>
    call<StripePrice>(key, "POST", "/prices", {
      currency: "inr",
      unit_amount: toPaise(input.amount),
      recurring: { interval: input.interval },
      product_data: { name: input.name },
      metadata: input.metadata,
    }),

  retrieveSubscription: (key: string, id: string) =>
    call<StripeSubscription>(key, "GET", `/subscriptions/${enc(id)}`, {
      expand: ["latest_invoice"],
    }),
  updateSubscription: (key: string, id: string, body: FormObject) =>
    call<StripeSubscription>(key, "POST", `/subscriptions/${enc(id)}`, body),
  retrieveInvoice: (key: string, id: string) =>
    call<StripeInvoice>(key, "GET", `/invoices/${enc(id)}`),

  createScheduleFromSubscription: (key: string, subscriptionId: string) =>
    call<StripeSchedule>(key, "POST", "/subscription_schedules", {
      from_subscription: subscriptionId,
    }),
  retrieveSchedule: (key: string, id: string) =>
    call<StripeSchedule>(key, "GET", `/subscription_schedules/${enc(id)}`),
  updateSchedule: (key: string, id: string, body: FormObject) =>
    call<StripeSchedule>(key, "POST", `/subscription_schedules/${enc(id)}`, body),
  releaseSchedule: (key: string, id: string) =>
    call<StripeSchedule>(key, "POST", `/subscription_schedules/${enc(id)}/release`),
};
