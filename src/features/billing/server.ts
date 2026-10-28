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
  idOf,
  invoiceSubscriptionId,
  stripe,
  type StripeInvoice,
  type StripeSubscription,
  subscriptionPeriod,
} from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/** Shopverse's own Stripe key (null: plans are changed by request). */
export function platformKey(): string | null {
  return env.PLATFORM_STRIPE_SECRET_KEY ?? null;
}

function requirePlatformKey(): string {
  const key = platformKey();
  if (!key)
    throw new AppError("UNAVAILABLE", "Online billing isn't set up yet. Email us to change plans.");
  return key;
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

/** The Stripe price for a Shopverse plan and interval, created on first use. */
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
  const created = await stripe.createPrice(requirePlatformKey(), {
    interval: interval === "yearly" ? "year" : "month",
    name: `Shopverse ${PLAN_NAMES[plan]} (${interval})`,
    amount: charge,
    metadata: { shopverse_plan: plan, interval },
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

/**
 * Start Stripe Checkout for a first plan. The subscription is recorded under
 * the Checkout Session until Stripe creates it (see linkCheckout).
 */
export async function startSubscription(
  organization: { id: string; slug: string },
  userId: string,
  plan: PaidPlanId,
  interval: BillingInterval,
  email: string | null,
) {
  const key = requirePlatformKey();
  const pp = await providerPlan(plan, interval);
  const billingPage = appUrl(routes.orgBilling(organization.slug));
  const metadata = { organization_id: organization.id, plan, interval };
  const session = await stripe.createCheckoutSession(key, {
    mode: "subscription",
    line_items: [{ price: pp.id, quantity: 1 }],
    customer_email: email ?? undefined,
    client_reference_id: organization.id,
    metadata,
    subscription_data: { metadata },
    success_url: `${billingPage}?checkout={CHECKOUT_SESSION_ID}`,
    cancel_url: `${billingPage}?checkout=cancelled`,
  });
  if (!session.url) throw new AppError("UNAVAILABLE", "Stripe didn't return a payment page.");
  const { error } = await createAdminClient().rpc("begin_subscription", {
    p_organization_id: organization.id,
    p_user_id: userId,
    p_plan: plan,
    p_interval: interval,
    p_base_amount: pp.price,
    p_amount: pp.charge,
    p_provider_subscription_id: session.id,
    p_short_url: session.url,
  });
  if (error) throw fromPostgrestError(error);
  return { url: session.url };
}

/** Stripe's statuses -> the ones Shopverse keeps (shared with the plan logic in SQL). */
const STATUS: Record<StripeSubscription["status"], string> = {
  incomplete: "created",
  incomplete_expired: "expired",
  trialing: "active",
  active: "active",
  past_due: "pending",
  unpaid: "halted",
  paused: "halted",
  canceled: "cancelled",
};

async function latestInvoice(key: string, sub: StripeSubscription): Promise<StripeInvoice | null> {
  if (!sub.latest_invoice) return null;
  if (typeof sub.latest_invoice === "object") return sub.latest_invoice;
  return stripe.retrieveInvoice(key, sub.latest_invoice);
}

async function sync(sub: StripeSubscription) {
  const status = STATUS[sub.status] ?? "pending";
  const period = subscriptionPeriod(sub);
  // While a payment is owed, link to Stripe's page for paying that invoice.
  let payUrl: string | undefined;
  if (status === "pending" || status === "halted") {
    const key = platformKey();
    const invoice = key ? await latestInvoice(key, sub).catch(() => null) : null;
    if (invoice?.status === "open") payUrl = invoice.hosted_invoice_url ?? undefined;
  }
  const { data, error } = await createAdminClient().rpc("sync_subscription", {
    p_provider_subscription_id: sub.id,
    p_status: status,
    p_provider_plan_id: sub.items.data[0]?.price.id ?? "",
    p_current_start: iso(period.start) ?? undefined,
    p_current_end: iso(period.end) ?? undefined,
    p_short_url: payUrl,
  });
  if (error) throw fromPostgrestError(error);
  return data as { status: string } | null;
}

/** Swap the Checkout Session id for the subscription Stripe created. */
async function linkCheckout(checkoutId: string, subscriptionId: string) {
  const { data, error } = await createAdminClient().rpc("link_checkout_subscription", {
    p_checkout_id: checkoutId,
    p_provider_subscription_id: subscriptionId,
  });
  if (error) throw fromPostgrestError(error);
  return data;
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

/**
 * Bring a finished Checkout Session up to date: link its subscription, sync
 * it and record the first charge. Returns whether the checkout is complete.
 */
async function settleCheckout(key: string, checkoutId: string, organizationId?: string) {
  const session = await stripe.retrieveCheckoutSession(key, checkoutId, [
    "subscription",
    "subscription.latest_invoice",
  ]);
  if (session.mode !== "subscription") return false;
  if (organizationId && session.client_reference_id !== organizationId)
    throw Errors.notFound("Subscription");
  const subscriptionId = idOf(session.subscription);
  if (session.status !== "complete" || !subscriptionId) return false;
  if (!(await linkCheckout(session.id, subscriptionId))) return false;
  const sub =
    typeof session.subscription === "object" && session.subscription
      ? session.subscription
      : await stripe.retrieveSubscription(key, subscriptionId);
  await sync(sub);
  const invoice = await latestInvoice(key, sub);
  if (invoice?.status === "paid" && invoice.amount_paid > 0)
    await recordCharge(sub.id, invoice.id, fromPaise(invoice.amount_paid));
  return true;
}

/** Back from Checkout: confirm with Stripe (never the browser's word). */
export async function confirmSubscription(organizationId: string, checkoutId: string) {
  const owner = await subscriptionOrg(checkoutId);
  const key = requirePlatformKey();
  // Already linked (e.g. the webhook was first): just look it up.
  if (!owner) {
    const session = await stripe.retrieveCheckoutSession(key, checkoutId);
    if (session.client_reference_id !== organizationId) throw Errors.notFound("Subscription");
    const subId = idOf(session.subscription);
    if (subId) await refreshSubscription(subId);
    return session.status === "complete";
  }
  if (owner.organization_id !== organizationId) throw Errors.notFound("Subscription");
  return settleCheckout(key, checkoutId, organizationId);
}

/** A pending downgrade lives in a subscription schedule; let go of it before other changes. */
async function releaseSchedule(key: string, sub: StripeSubscription) {
  const scheduleId = idOf(sub.schedule);
  if (scheduleId) await stripe.releaseSchedule(key, scheduleId);
}

/**
 * Change plan. Upgrades (and monthly -> yearly) apply now and charge the
 * difference straight away; downgrades and yearly -> monthly start at the
 * renewal, through a subscription schedule.
 */
export async function changeSubscriptionPlan(
  organizationId: string,
  current: { providerSubscriptionId: string; plan: PaidPlanId; interval: BillingInterval },
  target: { plan: PaidPlanId; interval: BillingInterval },
) {
  const key = requirePlatformKey();
  const now = isUpgrade(current, target);
  const pp = await providerPlan(target.plan, target.interval);
  const sub = await stripe.retrieveSubscription(key, current.providerSubscriptionId);
  const item = sub.items.data[0];
  if (!item) throw new AppError("UNAVAILABLE", "This subscription has no plan in Stripe.");
  await releaseSchedule(key, sub);

  if (now) {
    await stripe.updateSubscription(key, sub.id, {
      items: [{ id: item.id, price: pp.id }],
      proration_behavior: "always_invoice",
      // Refuse the change if the card can't pay for it.
      payment_behavior: "error_if_incomplete",
      metadata: { plan: target.plan, interval: target.interval },
    });
  } else {
    const schedule = await stripe.createScheduleFromSubscription(key, sub.id);
    const phase = schedule.phases[0];
    if (!phase) throw new AppError("UNAVAILABLE", "Stripe couldn't schedule the change.");
    await stripe.updateSchedule(key, schedule.id, {
      end_behavior: "release",
      phases: [
        {
          items: [{ price: item.price.id, quantity: 1 }],
          start_date: phase.start_date,
          end_date: phase.end_date,
        },
        { items: [{ price: pp.id, quantity: 1 }], iterations: 1 },
      ],
    });
  }
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
  const key = requirePlatformKey();
  const sub = await stripe.retrieveSubscription(key, providerSubscriptionId);
  await releaseSchedule(key, sub);
  await stripe.updateSubscription(key, sub.id, { cancel_at_period_end: true });
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

export type PlatformEvent = {
  id: string;
  type: string;
  data: { object: { id: string; object: string } & Record<string, unknown> };
};

/** Webhooks from Shopverse's Stripe account. */
export async function handlePlatformEvent(event: PlatformEvent) {
  const key = requirePlatformKey();
  const object = event.data.object;

  if (event.type === "checkout.session.completed" && object.object === "checkout.session") {
    return (await settleCheckout(key, object.id)) ? "processed" : "ignored";
  }

  let subscriptionId: string | null = null;
  if (object.object === "subscription") subscriptionId = object.id;
  else if (object.object === "invoice") subscriptionId = invoiceSubscriptionId(object as never);
  if (!subscriptionId) return "ignored";

  const before = await subscriptionOrg(subscriptionId);
  if (!before) return "unknown";
  // Always sync from Stripe's current view: events can arrive out of order.
  const sub = await stripe.retrieveSubscription(key, subscriptionId);
  await sync(sub);

  if (event.type === "invoice.paid" && object.object === "invoice") {
    const invoice = object as unknown as StripeInvoice;
    if (invoice.amount_paid > 0)
      await recordCharge(sub.id, invoice.id, fromPaise(invoice.amount_paid));
  }

  const { data: org } = await createAdminClient()
    .from("organizations")
    .select("slug, past_due_since")
    .eq("id", before.organization_id)
    .single();
  const planName = PLAN_NAMES[before.plan];
  const status = STATUS[sub.status];
  if ((status === "pending" || status === "halted") && before.status === "active" && org) {
    const invoice = await latestInvoice(key, sub).catch(() => null);
    after(() =>
      emailBusiness(before.organization_id, {
        type: "payment_failed",
        planName,
        updateUrl: invoice?.hosted_invoice_url ?? null,
        graceEndsAt: new Date(
          new Date(org.past_due_since ?? Date.now()).getTime() + 7 * 86_400_000,
        ).toISOString(),
      }),
    );
  }
  if (
    ["cancelled", "completed", "expired"].includes(status ?? "") &&
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

/**
 * Bring a subscription up to date from Stripe (e.g. when the billing page
 * opens). A checkout not linked yet is looked up by its session.
 */
export async function refreshSubscription(providerSubscriptionId: string) {
  const key = platformKey();
  if (!key) return;
  try {
    if (providerSubscriptionId.startsWith("cs_")) await settleCheckout(key, providerSubscriptionId);
    else await sync(await stripe.retrieveSubscription(key, providerSubscriptionId));
  } catch (cause) {
    logger.warn({ err: cause, providerSubscriptionId }, "Subscription refresh failed");
  }
}
