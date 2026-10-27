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

export const PLAN_NAMES: Record<PlanId, string> = {
  trial: "Free trial",
  starter: PLANS.starter.name,
  growth: PLANS.growth.name,
  scale: PLANS.scale.name,
};
