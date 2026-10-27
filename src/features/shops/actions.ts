"use server";

import { refresh } from "next/cache";

import { can } from "@/features/organizations/permissions";
import { createShopSchema } from "@/features/shops/schemas";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";

export const createShop = createAction({
  name: "shops.create",
  schema: createShopSchema,
  handler: async (input, { supabase, user }) => {
    // Resolve the organization through RLS: non-members simply get no row.
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id, organization_members!inner(role)")
      .eq("slug", input.organizationSlug)
      .eq("organization_members.user_id", user.id)
      .maybeSingle();

    if (orgError) throw fromPostgrestError(orgError);
    if (!org) throw Errors.notFound("Organization");

    const role = org.organization_members[0]?.role;
    if (!can(role, "shops.create"))
      throw Errors.forbidden("Only owners and admins can create shops.");

    const { data: shop, error } = await supabase
      .from("shops")
      .insert({
        organization_id: org.id,
        name: input.name,
        slug: input.slug,
        currency: input.currency,
      })
      .select("id, slug")
      .single();

    if (error) throw fromPostgrestError(error, { conflictField: "slug" });

    // Audit entry is written by the shops_audit database trigger.
    refresh();
    return shop;
  },
});
