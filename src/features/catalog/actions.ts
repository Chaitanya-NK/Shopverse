"use server";

import { refresh } from "next/cache";

import { addIndustriesSchema } from "@/features/catalog/schemas";
import { can } from "@/features/organizations/permissions";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";

/** Add industries to an organization and seed their starter categories. */
export const addIndustries = createAction({
  name: "catalog.addIndustries",
  schema: addIndustriesSchema,
  handler: async ({ organizationSlug, industries }, { supabase, user }) => {
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id, organization_members!inner(role)")
      .eq("slug", organizationSlug)
      .eq("organization_members.user_id", user.id)
      .maybeSingle();

    if (orgError) throw fromPostgrestError(orgError);
    if (!org) throw Errors.notFound("Organization");
    if (!can(org.organization_members[0]?.role, "organization.update")) {
      throw Errors.forbidden("Only owners and admins can add industries.");
    }

    const { error } = await supabase.rpc("add_industries", {
      p_organization_id: org.id,
      p_industries: industries,
    });
    if (error) throw fromPostgrestError(error);

    refresh();
    return { added: industries.length };
  },
});
