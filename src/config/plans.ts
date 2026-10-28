import { type Enums } from "@/types/database.types";

export type PlanId = Enums<"plan_tier">;

/**
 * What each plan is called and costs. Limits themselves live in the database
 * (private.plan_limits) so they are enforced where data is written.
 */
export const PLANS: Record<
  Exclude<PlanId, "trial">,
  { name: string; priceMonthly: number; tagline: string; extras: string[] }
> = {
  starter: {
    name: "Starter",
    priceMonthly: 999,
    tagline: "One shop, getting going",
    extras: ["Storefront with COD checkout", "Delivery OTP and tracking"],
  },
  growth: {
    name: "Growth",
    priceMonthly: 2999,
    tagline: "Several shops and warehouses",
    extras: ["Everything in Starter", "Per-shop staff access", "Audit log"],
  },
  scale: {
    name: "Scale",
    priceMonthly: 7999,
    tagline: "No limits",
    extras: ["Everything in Growth", "Unlimited shops, team and products", "Priority support"],
  },
};

export type PaidPlanId = Exclude<PlanId, "trial">;
export const PLAN_ORDER: PaidPlanId[] = ["starter", "growth", "scale"];
export const BILLING_INTERVALS = ["monthly", "yearly"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** Yearly billing: two months free. */
export const YEARLY_MONTHS = 10;

/** Price per period before GST. */
export function planPrice(plan: PaidPlanId, interval: BillingInterval): number {
  return PLANS[plan].priceMonthly * (interval === "yearly" ? YEARLY_MONTHS : 1);
}

/** What is charged: the price plus GST when Shopverse is GST-registered. */
export function planCharge(price: number, gstRate: number | null): number {
  return gstRate ? Math.round(price * (100 + gstRate)) / 100 : price;
}

/** Bigger plan first: is moving from `from` to `to` an upgrade (applies now)? */
export function isUpgrade(
  from: { plan: PaidPlanId; interval: BillingInterval },
  to: { plan: PaidPlanId; interval: BillingInterval },
): boolean {
  const rank = PLAN_ORDER.indexOf(to.plan) - PLAN_ORDER.indexOf(from.plan);
  if (rank !== 0) return rank > 0;
  // Same plan: monthly -> yearly pays more up front, so it starts now too.
  return from.interval === "monthly" && to.interval === "yearly";
}

export const PLAN_NAMES: Record<PlanId, string> = {
  trial: "Free trial",
  starter: PLANS.starter.name,
  growth: PLANS.growth.name,
  scale: PLANS.scale.name,
};
