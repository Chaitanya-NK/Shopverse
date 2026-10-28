import "server-only";

import { cache } from "react";
import { z } from "zod";

import { fromPostgrestError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { Constants } from "@/types/database.types";

const limits = z.object({
  shops: z.number().nullable(),
  seats: z.number().nullable(),
  products: z.number().nullable(),
  warehouses: z.number().nullable(),
});
const overages = z.array(z.object({ resource: z.string(), used: z.number(), limit: z.number() }));
const paidPlan = z.enum(["starter", "growth", "scale"]);
const interval = z.enum(["monthly", "yearly"]);

const subscriptionSchema = z
  .object({
    id: z.uuid(),
    provider_subscription_id: z.string(),
    plan: paidPlan,
    interval,
    amount: z.coerce.number(),
    base_amount: z.coerce.number(),
    status: z.enum([
      "created",
      "authenticated",
      "active",
      "pending",
      "halted",
      "cancelled",
      "completed",
      "expired",
    ]),
    current_period_start: z.string().nullable(),
    current_period_end: z.string().nullable(),
    cancel_at_period_end: z.boolean(),
    scheduled_plan: paidPlan.nullable(),
    scheduled_interval: interval.nullable(),
    short_url: z.string().nullable(),
  })
  .transform((s) => ({
    id: s.id,
    providerSubscriptionId: s.provider_subscription_id,
    plan: s.plan,
    interval: s.interval,
    amount: s.amount,
    baseAmount: s.base_amount,
    status: s.status,
    periodStart: s.current_period_start,
    periodEnd: s.current_period_end,
    cancelAtPeriodEnd: s.cancel_at_period_end,
    scheduledPlan: s.scheduled_plan,
    scheduledInterval: s.scheduled_interval,
    shortUrl: s.short_url,
  }));
export type Subscription = z.output<typeof subscriptionSchema>;

const overviewSchema = z
  .object({
    plan: z.enum(Constants.public.Enums.plan_tier),
    trial_ends_at: z.string().nullable(),
    trial_expired: z.boolean(),
    interval: interval.nullable(),
    renews_at: z.string().nullable(),
    past_due_since: z.string().nullable(),
    grace_ends_at: z.string().nullable(),
    had_subscription: z.boolean(),
    subscription: subscriptionSchema.nullable(),
    profile: z.record(z.string(), z.string()).optional().default({}),
    limits,
    usage: z.object({
      shops: z.number(),
      seats: z.number(),
      products: z.number(),
      warehouses: z.number(),
      orders_this_month: z.number(),
    }),
    plans: z.object({ starter: limits, growth: limits, scale: limits }),
    overages: z.object({ starter: overages, growth: overages, scale: overages }),
  })
  .transform((o) => ({
    plan: o.plan,
    trialEndsAt: o.trial_ends_at,
    trialExpired: o.trial_expired,
    interval: o.interval,
    renewsAt: o.renews_at,
    pastDueSince: o.past_due_since,
    graceEndsAt: o.grace_ends_at,
    hadSubscription: o.had_subscription,
    subscription: o.subscription,
    profile: {
      legalName: o.profile.legal_name ?? "",
      email: o.profile.email ?? "",
      gstin: o.profile.gstin ?? "",
      line1: o.profile.line1 ?? "",
      city: o.profile.city ?? "",
      state: o.profile.state ?? "",
      postalCode: o.profile.postal_code ?? "",
    },
    limits: o.limits,
    usage: { ...o.usage, ordersThisMonth: o.usage.orders_this_month },
    plans: o.plans,
    overages: o.overages,
  }));

export type BillingOverview = z.output<typeof overviewSchema>;
export type PlanLimits = z.output<typeof limits>;

export const getBillingOverview = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_billing_overview", {
    p_organization_id: organizationId,
  });
  if (error) throw fromPostgrestError(error);
  return overviewSchema.parse(data);
});

export type PlatformInvoiceRow = {
  id: string;
  number: string;
  total: number;
  plan: string;
  interval: string;
  periodStart: string | null;
  periodEnd: string | null;
  issuedAt: string;
};

/** Shopverse's invoices to this business (owners and admins). */
export const listPlatformInvoices = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("platform_invoices")
    .select("id, number, total, plan, interval, period_start, period_end, issued_at")
    .eq("organization_id", organizationId)
    .order("issued_at", { ascending: false })
    .limit(48);
  if (error) throw fromPostgrestError(error);
  return data.map((i): PlatformInvoiceRow => ({
    id: i.id,
    number: i.number,
    total: Number(i.total),
    plan: i.plan,
    interval: i.interval,
    periodStart: i.period_start,
    periodEnd: i.period_end,
    issuedAt: i.issued_at,
  }));
});

const party = z.record(z.string(), z.unknown());
export const platformInvoiceSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  number: z.string(),
  provider_payment_id: z.string(),
  plan: z.enum(Constants.public.Enums.plan_tier),
  interval: z.string(),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
  taxable: z.coerce.number(),
  gst_rate: z.coerce.number(),
  cgst: z.coerce.number(),
  sgst: z.coerce.number(),
  igst: z.coerce.number(),
  total: z.coerce.number(),
  sac_code: z.string().nullable(),
  seller: party,
  buyer: party,
  issued_at: z.string(),
});
export type PlatformInvoice = z.output<typeof platformInvoiceSchema>;

export const getPlatformInvoice = cache(async (invoiceId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_invoice", { p_invoice_id: invoiceId });
  if (error) throw fromPostgrestError(error);
  return data ? platformInvoiceSchema.parse(data) : null;
});
