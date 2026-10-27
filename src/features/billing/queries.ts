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

const overviewSchema = z
  .object({
    plan: z.enum(Constants.public.Enums.plan_tier),
    trial_ends_at: z.string().nullable(),
    trial_expired: z.boolean(),
    limits,
    usage: z.object({
      shops: z.number(),
      seats: z.number(),
      products: z.number(),
      warehouses: z.number(),
      orders_this_month: z.number(),
    }),
    plans: z.object({ starter: limits, growth: limits, scale: limits }),
  })
  .transform((o) => ({
    plan: o.plan,
    trialEndsAt: o.trial_ends_at,
    trialExpired: o.trial_expired,
    limits: o.limits,
    usage: { ...o.usage, ordersThisMonth: o.usage.orders_this_month },
    plans: o.plans,
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
