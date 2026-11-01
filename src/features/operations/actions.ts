"use server";

import { refresh } from "next/cache";

import { operationsSettingsSchema } from "@/features/operations/schemas";
import { sendDigest } from "@/features/operations/server";
import { slugSchema } from "@/features/organizations/schemas";
import { authorizeOrganization } from "@/features/organizations/server";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";
import { z } from "zod";

export const saveOperationsSettings = createAction({
  name: "operations.saveSettings",
  schema: operationsSettingsSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "operations.settings",
      "Only owners and admins can change these settings.",
    );
    const { error } = await supabase.rpc("save_operations_settings", {
      p_organization_id: org.id,
      p_low_stock_alerts: input.lowStockAlerts,
      p_daily_digest: input.dailyDigest,
      p_digest_hour: input.digestHour,
      p_recipient_roles: input.recipientRoles,
      p_courier: input.courier === "none" ? "" : input.courier,
    });
    if (error) throw fromPostgrestError(error);
    refresh();
    return null;
  },
});

/** Email today's digest to the person asking, to see what it looks like. */
export const sendDigestPreview = createAction({
  name: "operations.digestPreview",
  schema: z.object({ organizationSlug: slugSchema }),
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "operations.settings",
      "Only owners and admins can send a preview.",
    );
    if (!user.email) throw Errors.validation({}, "Your account has no email address.");
    await sendDigest(org.id, user.email);
    return { to: user.email };
  },
});
