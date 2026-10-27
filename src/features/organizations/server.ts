import "server-only";

import { type Capability, can, type OrgRole } from "@/features/organizations/permissions";
import { Errors, fromPostgrestError } from "@/lib/errors";
import { type ServerSupabaseClient } from "@/lib/supabase/server";

export type ActionOrganization = { id: string; role: OrgRole };

/**
 * Resolve an organization by slug inside a server action and check the
 * caller's capability. Non-members get NOT_FOUND (tenants are never revealed);
 * members without the capability get FORBIDDEN. RLS still enforces the same
 * rules in the database — this only produces clear errors early.
 */
export async function authorizeOrganization(
  supabase: ServerSupabaseClient,
  userId: string,
  organizationSlug: string,
  capability: Capability,
  forbiddenMessage: string,
): Promise<ActionOrganization> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, organization_members!inner(role)")
    .eq("slug", organizationSlug)
    .eq("organization_members.user_id", userId)
    .maybeSingle();

  if (error) throw fromPostgrestError(error);
  if (!data) throw Errors.notFound("Organization");

  const role = data.organization_members[0]?.role;
  if (!role || !can(role, capability)) throw Errors.forbidden(forbiddenMessage);

  return { id: data.id, role };
}
