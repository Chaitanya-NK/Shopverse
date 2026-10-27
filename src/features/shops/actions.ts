"use server";

import { refresh } from "next/cache";

import { authorizeOrganization } from "@/features/organizations/server";
import { createShopSchema } from "@/features/shops/schemas";
import { createAction } from "@/lib/actions/create-action";
import { fromPostgrestError } from "@/lib/errors";

export const createShop = createAction({
  name: "shops.create",
  schema: createShopSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "shops.create",
      "Only owners and admins can create shops.",
    );

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
