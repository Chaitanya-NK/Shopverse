"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { cartReminderSettingsSchema } from "@/features/marketing/schemas";
import { authorizeOrganization } from "@/features/organizations/server";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";

/** Shopper, from the reminder email. */
export const stopCartReminders = createAction({
  name: "marketing.stopReminders",
  schema: z.object({ shopSlug: z.string().max(48), token: z.string().regex(/^[0-9a-f]{48}$/) }),
  requireAuth: false,
  handler: async (input) => {
    const { data, error } = await createAdminClient().rpc("cart_reminder_optout", {
      p_token: input.token,
    });
    if (error) throw fromPostgrestError(error);
    if (!data) throw Errors.validation({}, "This link has expired.");
    return null;
  },
});

export const saveCartReminderSettings = createAction({
  name: "marketing.cartReminders",
  schema: cartReminderSettingsSchema,
  handler: async (input, { supabase, user }) => {
    await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "marketing.manage",
      "Only owners, admins and managers can change cart reminders.",
    );
    const { error } = await supabase.rpc("save_cart_reminder_settings", {
      p_shop_id: input.shopId,
      p_enabled: input.enabled,
      p_delay_hours: input.delayHours,
      p_code: input.code,
    });
    if (error) {
      if (/discount code/i.test(error.message))
        throw Errors.validation({ code: [error.message] }, error.message);
      throw fromPostgrestError(error);
    }
    refresh();
    return null;
  },
});
