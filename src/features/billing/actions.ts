"use server";

import { refresh } from "next/cache";

import { isUpgrade, PLAN_NAMES } from "@/config/plans";
import { getBillingOverview } from "@/features/billing/queries";
import {
  billingProfileSchema,
  choosePlanSchema,
  confirmSubscriptionSchema,
  orgOnlySchema,
} from "@/features/billing/schemas";
import {
  cancelSubscriptionAtPeriodEnd,
  changeSubscriptionPlan,
  confirmSubscription,
  startSubscription,
} from "@/features/billing/server";
import { authorizeOrganization } from "@/features/organizations/server";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";
import { type ServerSupabaseClient } from "@/lib/supabase/server";

const FORBIDDEN = "Only owners can change the plan or billing details.";

const owner = (supabase: ServerSupabaseClient, userId: string, slug: string) =>
  authorizeOrganization(supabase, userId, slug, "organization.billing", FORBIDDEN);

const RESOURCE_NAMES: Record<string, string> = {
  shops: "shops",
  seats: "team seats",
  products: "products",
  warehouses: "warehouses",
};

export const saveBillingProfile = createAction({
  name: "billing.saveProfile",
  schema: billingProfileSchema,
  handler: async (input, { supabase, user }) => {
    const org = await owner(supabase, user.id, input.organizationSlug);
    const { error } = await supabase.rpc("save_billing_profile", {
      p_organization_id: org.id,
      p_profile: {
        legal_name: input.legalName,
        email: input.email,
        gstin: input.gstin,
        line1: input.line1,
        city: input.city,
        state: input.state,
        postal_code: input.postalCode,
      },
    });
    if (error) throw fromPostgrestError(error);
    refresh();
    return null;
  },
});

/** Start Checkout for a first plan (or after the last one ended). */
export const startPlanCheckout = createAction({
  name: "billing.startCheckout",
  schema: choosePlanSchema,
  handler: async (input, { supabase, user }) => {
    const org = await owner(supabase, user.id, input.organizationSlug);
    const billing = await getBillingOverview(org.id);
    if (!billing.profile.legalName) throw Errors.validation({}, "Add your billing details first.");
    if (billing.subscription) throw Errors.conflict("You already have a plan. Change it instead.");
    const over = billing.overages[input.plan];
    if (over.length > 0)
      throw Errors.validation(
        {},
        `${PLAN_NAMES[input.plan]} allows ${over.map((o) => `${o.limit} ${RESOURCE_NAMES[o.resource] ?? o.resource}`).join(" and ")}. Archive some first, or choose a bigger plan.`,
      );
    const session = await startSubscription(org.id, user.id, input.plan, input.interval);
    return {
      ...session,
      description: `${PLAN_NAMES[input.plan]} plan, billed ${input.interval}`,
      email: billing.profile.email,
    };
  },
});

export const confirmPlanCheckout = createAction({
  name: "billing.confirmCheckout",
  schema: confirmSubscriptionSchema,
  handler: async (input, { supabase, user }) => {
    const org = await owner(supabase, user.id, input.organizationSlug);
    await confirmSubscription(org.id, input);
    refresh();
    return null;
  },
});

export const changePlan = createAction({
  name: "billing.changePlan",
  schema: choosePlanSchema,
  handler: async (input, { supabase, user }) => {
    const org = await owner(supabase, user.id, input.organizationSlug);
    const billing = await getBillingOverview(org.id);
    const sub = billing.subscription;
    if (!sub) throw Errors.validation({}, "Choose a plan first.");
    if (sub.status !== "active")
      throw Errors.validation({}, "Settle the current payment before changing plan.");
    if (sub.cancelAtPeriodEnd)
      throw Errors.validation({}, "Your plan is set to end. Choose a plan again once it does.");
    if (sub.plan === input.plan && sub.interval === input.interval)
      throw Errors.validation({}, "You're already on this plan.");
    const target = { plan: input.plan, interval: input.interval };
    if (!isUpgrade(sub, target) && billing.overages[input.plan].length > 0)
      throw Errors.validation(
        {},
        `${PLAN_NAMES[input.plan]} allows fewer ${billing.overages[input.plan].map((o) => RESOURCE_NAMES[o.resource] ?? o.resource).join(" and ")} than you use. Archive some first.`,
      );
    const result = await changeSubscriptionPlan(
      org.id,
      {
        providerSubscriptionId: sub.providerSubscriptionId,
        plan: sub.plan,
        interval: sub.interval,
      },
      target,
    );
    refresh();
    return result;
  },
});

export const cancelPlan = createAction({
  name: "billing.cancel",
  schema: orgOnlySchema,
  handler: async (input, { supabase, user }) => {
    const org = await owner(supabase, user.id, input.organizationSlug);
    const billing = await getBillingOverview(org.id);
    if (!billing.subscription) throw Errors.validation({}, "There's no plan to cancel.");
    await cancelSubscriptionAtPeriodEnd(billing.subscription.providerSubscriptionId);
    refresh();
    return { endsAt: billing.subscription.periodEnd };
  },
});
