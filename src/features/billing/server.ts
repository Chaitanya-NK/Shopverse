import "server-only";

import { after } from "next/server";

import {
  type BillingInterval,
  isUpgrade,
  PLAN_NAMES,
  type PaidPlanId,
  planCharge,
  planPrice,
} from "@/config/plans";
import { routes } from "@/config/routes";
import { env } from "@/env";
import { billingEmail, type BillingEmail } from "@/features/billing/emails";
import { AppError, Errors, fromPostgrestError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import {
  fromPaise,
  razorpay,
  type RazorpayCredentials,
  type RazorpaySubscription,
  verifySubscriptionSignature,
} from "@/lib/payments/razorpay";
import { createAdminClient } from "@/lib/supabase/admin";

/** Shopverse's own Razorpay keys (null: plans are changed by request). */
export function platformCredentials(): RazorpayCredentials | null {
  if (!env.PLATFORM_RAZORPAY_KEY_ID || !env.PLATFORM_RAZORPAY_KEY_SECRET) return null;
  return { keyId: env.PLATFORM_RAZORPAY_KEY_ID, keySecret: env.PLATFORM_RAZORPAY_KEY_SECRET };
}

export function requirePlatformCredentials(): RazorpayCredentials {
  const c = platformCredentials();
  if (!c)
    throw new AppError("UNAVAILABLE", "Online billing isn't set up yet. Email us to change plans.");
  return c;
}

/** GST added to plan prices (only when Shopverse is GST-registered). */
export const platformGstRate = () => (env.PLATFORM_GSTIN ? env.PLATFORM_GST_RATE : null);

function seller() {
  return {
    legal_name: env.PLATFORM_LEGAL_NAME,
    gstin: env.PLATFORM_GSTIN ?? null,
    line1: env.PLATFORM_ADDRESS ?? null,
    city: env.PLATFORM_CITY ?? null,
    state: env.PLATFORM_STATE ?? null,
    postal_code: env.PLATFORM_POSTAL_CODE ?? null,
  };
}

const iso = (seconds: number | null) => (seconds ? new Date(seconds * 1000).toISOString() : null);
const appUrl = (path: string) => new URL(path, env.NEXT_PUBLIC_APP_URL).toString();

/** The Razorpay plan for a Shopverse plan and interval, created on first use. */
async function providerPlan(plan: PaidPlanId, interval: BillingInterval) {
  const admin = createAdminClient();
  const price = planPrice(plan, interval);
  const charge = planCharge(price, platformGstRate());
  const { data, error } = await admin.rpc("platform_provider_plan", {
    p_plan: plan,
    p_interval: interval,
    p_amount: price,
  });
  if (error) throw fromPostgrestError(error);
  if (data) return { id: data, price, charge };
  const created = await razorpay.createPlan(requirePlatformCredentials(), {
    period: interval,
    name: `Shopverse ${PLAN_NAMES[plan]} (${interval})`,
    amount: charge,
    notes: { shopverse_plan: plan, interval },
  });
  const { data: saved, error: saveError } = await admin.rpc("save_provider_plan", {
    p_plan: plan,
    p_interval: interval,
    p_amount: price,
    p_charge_amount: charge,
    p_provider_plan_id: created.id,
  });
  if (saveError) throw fromPostgrestError(saveError);
  return { id: saved ?? created.id, price, charge };
}

/** Create a Razorpay subscription for Checkout to authorise. */
export async function startSubscription(
  organizationId: string,
  userId: string,
  plan: PaidPlanId,
  interval: BillingInterval,
) {
  const credentials = requirePlatformCredentials();
  const pp = await providerPlan(plan, interval);
  const sub = await razorpay.createSubscription(credentials, {
    planId: pp.id,
    // Ten years of renewals; cancelling ends it sooner.
    totalCount: interval === "yearly" ? 10 : 120,
    notes: { organization_id: organizationId, plan, interval },
  });
  const { error } = await createAdminClient().rpc("begin_subscription", {
    p_organization_id: organizationId,
    p_user_id: userId,
    p_plan: plan,
    p_interval: interval,
    p_base_amount: pp.price,
    p_amount: pp.charge,
    p_provider_subscription_id: sub.id,
    p_short_url: sub.short_url ?? "",
  });
  if (error) throw fromPostgrestError(error);
  return { keyId: credentials.keyId, subscriptionId: sub.id, amount: pp.charge };
}

async function sync(sub: RazorpaySubscription) {
  const { data, error } = await createAdminClient().rpc("sync_subscription", {
    p_provider_subscription_id: sub.id,
    p_status: sub.status,
    p_provider_plan_id: sub.plan_id,
    p_current_start: iso(sub.current_start) ?? undefined,
    p_current_end: iso(sub.current_end) ?? undefined,
    p_short_url: sub.short_url ?? undefined,
  });
  if (error) throw fromPostgrestError(error);
  return data as { status: string } | null;
}

async function subscriptionOrg(subscriptionId: string) {
  const { data, error } = await createAdminClient()
    .from("subscriptions")
    .select("organization_id, plan, status")
    .eq("provider_subscription_id", subscriptionId)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  return data;
}

/** Record a charge (idempotent) and email the invoice. */
async function recordCharge(subscriptionId: string, paymentId: string, amount: number) {
  const admin = createAdminClient();
  const { data: before } = await admin
    .from("platform_invoices")
    .select("id")
    .eq("provider_payment_id", paymentId)
    .maybeSingle();
  const { data: invoiceId, error } = await admin.rpc("record_platform_charge", {
    p_provider_subscription_id: subscriptionId,
    p_payment_id: paymentId,
    p_amount: amount,
    p_seller: seller(),
    p_gst_rate: env.PLATFORM_GST_RATE,
    p_sac_code: env.PLATFORM_SAC_CODE,
  });
  if (error) throw fromPostgrestError(error);
  if (before) return;
  const { data: invoice } = await admin
    .from("platform_invoices")
    .select("number, total, plan, organization_id, organization:organizations (slug)")
    .eq("id", invoiceId)
    .single();
  if (invoice?.organization)
    await emailBusiness(invoice.organization_id, {
      type: "receipt",
      invoiceNumber: invoice.number,
      amount: Number(invoice.total),
      planName: PLAN_NAMES[invoice.plan],
      invoiceUrl: appUrl(routes.orgPlatformInvoice(invoice.organization.slug, invoiceId)),
    });
}

/** After Checkout: check Razorpay's signature, then bring the plan up to date. */
export async function confirmSubscription(
  organizationId: string,
  input: { subscriptionId: string; paymentId: string; signature: string },
) {
  const credentials = requirePlatformCredentials();
  if (!verifySubscriptionSignature(credentials.keySecret, input))
    throw Errors.validation({}, "We couldn't verify this payment. If money was taken, contact us.");
  const owner = await subscriptionOrg(input.subscriptionId);
  if (!owner || owner.organization_id !== organizationId) throw Errors.notFound("Subscription");
  const sub = await razorpay.fetchSubscription(credentials, input.subscriptionId);
  await sync(sub);
  const payment = await razorpay.fetchPayment(credentials, input.paymentId);
  if (payment.status === "captured")
    await recordCharge(sub.id, payment.id, fromPaise(payment.amount));
}

/**
 * Change plan. Upgrades (and monthly -> yearly) apply now; downgrades and
 * yearly -> monthly at the renewal.
 */
export async function changeSubscriptionPlan(
  organizationId: string,
  current: { providerSubscriptionId: string; plan: PaidPlanId; interval: BillingInterval },
  target: { plan: PaidPlanId; interval: BillingInterval },
) {
  const credentials = requirePlatformCredentials();
  const now = isUpgrade(current, target);
  const pp = await providerPlan(target.plan, target.interval);
  await razorpay.updateSubscription(
    credentials,
    current.providerSubscriptionId,
    pp.id,
    now ? "now" : "cycle_end",
  );
  const { error } = await createAdminClient().rpc("change_subscription_plan", {
    p_provider_subscription_id: current.providerSubscriptionId,
    p_plan: target.plan,
    p_interval: target.interval,
    p_base_amount: pp.price,
    p_amount: pp.charge,
    p_now: now,
  });
  if (error) throw fromPostgrestError(error);
  logger.info({ organizationId, target, now }, "Plan changed");
  return { now };
}

export async function cancelSubscriptionAtPeriodEnd(providerSubscriptionId: string) {
  await razorpay.cancelSubscription(requirePlatformCredentials(), providerSubscriptionId, true);
  const { error } = await createAdminClient().rpc("mark_subscription_cancelling", {
    p_provider_subscription_id: providerSubscriptionId,
  });
  if (error) throw fromPostgrestError(error);
}

async function emailBusiness(organizationId: string, email: BillingEmail) {
  try {
    const { data } = await createAdminClient().rpc("billing_contacts", {
      p_organization_id: organizationId,
    });
    const contacts = data as { name: string; emails: string[] } | null;
    if (!contacts) return;
    for (const to of contacts.emails) await sendMail(billingEmail(to, contacts.name, email));
  } catch (cause) {
    logger.warn({ err: cause, organizationId, email: email.type }, "Billing email failed");
  }
}

type PlatformEvent = {
  event: string;
  payload: {
    subscription?: { entity: RazorpaySubscription };
    payment?: { entity: { id: string; amount: number; status: string } };
  };
};

/** Webhooks from Shopverse's Razorpay account. */
export async function handlePlatformEvent(event: PlatformEvent) {
  const sub = event.payload.subscription?.entity;
  if (!sub || !event.event.startsWith("subscription.")) return "ignored";
  const before = await subscriptionOrg(sub.id);
  if (!before) return "unknown";
  await sync(sub);
  const payment = event.payload.payment?.entity;
  if (event.event === "subscription.charged" && payment?.status === "captured")
    await recordCharge(sub.id, payment.id, fromPaise(payment.amount));

  const { data: org } = await createAdminClient()
    .from("organizations")
    .select("slug, past_due_since")
    .eq("id", before.organization_id)
    .single();
  const planName = PLAN_NAMES[before.plan];
  if ((sub.status === "pending" || sub.status === "halted") && before.status === "active" && org)
    after(() =>
      emailBusiness(before.organization_id, {
        type: "payment_failed",
        planName,
        updateUrl: sub.short_url ?? null,
        graceEndsAt: new Date(
          new Date(org.past_due_since ?? Date.now()).getTime() + 7 * 86_400_000,
        ).toISOString(),
      }),
    );
  if (
    ["cancelled", "completed", "expired"].includes(sub.status) &&
    ["active", "authenticated", "pending", "halted"].includes(before.status) &&
    org
  )
    after(() =>
      emailBusiness(before.organization_id, {
        type: "plan_ended",
        planName,
        billingUrl: appUrl(routes.orgBilling(org.slug)),
      }),
    );
  return "processed";
}

/** Bring a subscription up to date from Razorpay (e.g. when the billing page opens). */
export async function refreshSubscription(providerSubscriptionId: string) {
  const credentials = platformCredentials();
  if (!credentials) return;
  try {
    await sync(await razorpay.fetchSubscription(credentials, providerSubscriptionId));
  } catch (cause) {
    logger.warn({ err: cause, providerSubscriptionId }, "Subscription refresh failed");
  }
}
