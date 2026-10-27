"use server";

import { refresh } from "next/cache";

import { addIndustriesSchema } from "@/features/catalog/schemas";
import { authorizeOrganization } from "@/features/organizations/server";
import { createAction } from "@/lib/actions/create-action";
import { fromPostgrestError } from "@/lib/errors";

/** Add industries to an organization and seed their starter categories. */
export const addIndustries = createAction({
  name: "catalog.addIndustries",
  schema: addIndustriesSchema,
  handler: async ({ organizationSlug, industries }, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      organizationSlug,
      "organization.update",
      "Only owners and admins can add industries.",
    );

    const { error } = await supabase.rpc("add_industries", {
      p_organization_id: org.id,
      p_industries: industries,
    });
    if (error) throw fromPostgrestError(error);

    refresh();
    return { added: industries.length };
  },
});
