import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";

import { type OrgRole } from "@/features/organizations/permissions";
import { requireUser } from "@/lib/auth/session";
import { fromPostgrestError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { type Enums } from "@/types/database.types";

export type Membership = {
  memberId: string;
  role: OrgRole;
  organization: {
    id: string;
    name: string;
    slug: string;
    plan: Enums<"plan_tier">;
    trialEndsAt: string | null;
    /** Set when a Shopverse plan payment failed (7 days of grace). */
    pastDueSince: string | null;
    industries: string[];
  };
};

/** All organizations the signed-in user belongs to, oldest first. */
export const listMyMemberships = cache(async (): Promise<Membership[]> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organization_members")
    .select(
      "id, role, organization:organizations!inner(id, name, slug, plan, trial_ends_at, past_due_since, industries, created_at)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) throw fromPostgrestError(error);

  return data.map((row) => ({
    memberId: row.id,
    role: row.role,
    organization: {
      id: row.organization.id,
      name: row.organization.name,
      slug: row.organization.slug,
      plan: row.organization.plan,
      trialEndsAt: row.organization.trial_ends_at,
      pastDueSince: row.organization.past_due_since,
      industries: row.organization.industries,
    },
  }));
});

/**
 * Resolve the current organization from the URL and confirm membership.
 * Renders the 404 page for unknown slugs *and* for organizations the user
 * can't access, so the existence of other tenants is never revealed.
 */
export const requireMembership = cache(async (orgSlug: string): Promise<Membership> => {
  const memberships = await listMyMemberships();
  const membership = memberships.find((m) => m.organization.slug === orgSlug);
  if (!membership) notFound();
  return membership;
});
