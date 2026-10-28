import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { fromPostgrestError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { Constants } from "@/types/database.types";

/** Is the signed-in person a Shopverse platform admin? */
export const isPlatformAdmin = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error) return false;
  return data === true;
});

/** For /admin pages: platform admins only; everyone else gets a 404. */
export async function requirePlatformAdmin() {
  const user = await requireUser("/admin");
  if (!(await isPlatformAdmin())) notFound();
  return user;
}

const plan = z.enum(Constants.public.Enums.plan_tier);
const num = z.coerce.number();

const overviewSchema = z.object({
  businesses: num,
  new_30d: num,
  by_plan: z.record(z.string(), num),
  trials_active: num,
  trials_ending_7d: num,
  past_due: num,
  subscriptions: num,
  mrr: num,
  billed_30d: num,
  orders_30d: num,
  gmv_30d: num,
  recent_invoices: z.array(
    z.object({
      id: z.uuid(),
      number: z.string(),
      total: num,
      plan,
      interval: z.string(),
      issued_at: z.string(),
      organization: z.string(),
      organization_id: z.uuid(),
    }),
  ),
});
export type AdminOverview = z.output<typeof overviewSchema>;

export const getAdminOverview = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_overview");
  if (error) throw fromPostgrestError(error);
  return overviewSchema.parse(data);
});

export const ADMIN_FILTERS = {
  all: "All",
  trial: "On trial",
  trial_ended: "Trial ended",
  paying: "Paying",
  past_due: "Past due",
} as const;
export type AdminFilter = keyof typeof ADMIN_FILTERS;
export const ADMIN_PAGE_SIZE = 25;

const businessRow = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  plan,
  interval: z.string().nullable(),
  trial_ends_at: z.string().nullable(),
  renews_at: z.string().nullable(),
  past_due_since: z.string().nullable(),
  owner_email: z.string().nullable(),
  created_at: z.string(),
  shops: num,
  orders_30d: num,
  gmv_30d: num,
});
export type AdminBusinessRow = z.output<typeof businessRow>;

export const listBusinesses = cache(async (search: string, filter: AdminFilter, page: number) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_organizations", {
    p_search: search || undefined,
    p_filter: filter === "all" ? undefined : filter,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: (Math.max(1, page) - 1) * ADMIN_PAGE_SIZE,
  });
  if (error) throw fromPostgrestError(error);
  const parsed = z.object({ total: num, items: z.array(businessRow) }).parse(data);
  return {
    ...parsed,
    page: Math.max(1, page),
    pageCount: Math.max(1, Math.ceil(parsed.total / ADMIN_PAGE_SIZE)),
  };
});

const detailSchema = businessRow.omit({ owner_email: true, shops: true }).extend({
  industries: z.array(z.string()),
  profile: z.record(z.string(), z.string()),
  usage: z.record(z.string(), num),
  limits: z.record(z.string(), num.nullable()),
  members: z.array(
    z.object({
      email: z.string(),
      name: z.string().nullable(),
      role: z.string(),
      joined_at: z.string(),
    }),
  ),
  shops: z.array(z.object({ name: z.string(), slug: z.string(), status: z.string() })),
  subscriptions: z.array(
    z.object({
      id: z.uuid(),
      provider_subscription_id: z.string(),
      plan,
      interval: z.string(),
      amount: num,
      status: z.string(),
      current_period_end: z.string().nullable(),
      cancel_at_period_end: z.boolean(),
      created_at: z.string(),
      ended_at: z.string().nullable(),
    }),
  ),
  invoices: z.array(
    z.object({
      id: z.uuid(),
      number: z.string(),
      total: num,
      plan,
      interval: z.string(),
      issued_at: z.string(),
    }),
  ),
  audit: z.array(
    z.object({
      action: z.string(),
      at: z.string(),
      actor: z.string().nullable(),
      metadata: z.record(z.string(), z.unknown()),
    }),
  ),
});
export type AdminBusiness = z.output<typeof detailSchema>;

export const getBusiness = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_organization", {
    p_organization_id: organizationId,
  });
  if (error) {
    if (error.code === "P0002") return null;
    throw fromPostgrestError(error);
  }
  return detailSchema.parse(data);
});
