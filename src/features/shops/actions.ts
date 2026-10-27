"use server";

import { refresh } from "next/cache";

import { authorizeOrganization } from "@/features/organizations/server";
import { createShopSchema, toSettingsJson, updateShopSchema } from "@/features/shops/schemas";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";
import { type Json } from "@/types/database.types";

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

export const updateShop = createAction({
  name: "shops.update",
  schema: updateShopSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "shops.update",
      "Only owners and admins can change shop settings.",
    );

    const { data: current, error: readError } = await supabase
      .from("shops")
      .select("settings")
      .eq("id", input.shopId)
      .eq("organization_id", org.id)
      .maybeSingle();
    if (readError) throw fromPostgrestError(readError);
    if (!current) throw Errors.notFound("Shop");

    // Keep keys other features may store in settings; replace the storefront ones.
    const merged: Record<string, Json> = {
      ...(typeof current.settings === "object" &&
      current.settings &&
      !Array.isArray(current.settings)
        ? (current.settings as Record<string, Json>)
        : {}),
    };
    for (const [key, value] of Object.entries(toSettingsJson(input.settings))) {
      if (value === null) delete merged[key];
      else merged[key] = value;
    }

    const { error } = await supabase
      .from("shops")
      .update({ name: input.name, status: input.status, settings: merged })
      .eq("id", input.shopId)
      .eq("organization_id", org.id);
    if (error) throw fromPostgrestError(error);

    refresh();
    return { ok: true };
  },
});
