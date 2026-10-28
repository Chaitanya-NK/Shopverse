"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { isPlatformAdmin } from "@/features/admin/queries";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";
import { Constants } from "@/types/database.types";

async function requireAdmin() {
  if (!(await isPlatformAdmin())) throw Errors.notFound("Page");
}

export const extendTrial = createAction({
  name: "admin.extendTrial",
  schema: z.object({ organizationId: z.uuid(), days: z.coerce.number().int().min(1).max(90) }),
  handler: async (input, { supabase }) => {
    await requireAdmin();
    const { data, error } = await supabase.rpc("admin_extend_trial", {
      p_organization_id: input.organizationId,
      p_days: input.days,
    });
    if (error) throw fromPostgrestError(error);
    refresh();
    return { until: data };
  },
});

export const setPlan = createAction({
  name: "admin.setPlan",
  schema: z.object({
    organizationId: z.uuid(),
    plan: z.enum(Constants.public.Enums.plan_tier),
    note: z.string().trim().min(3, "Say why (kept in the business's audit log)").max(300),
  }),
  handler: async (input, { supabase }) => {
    await requireAdmin();
    const { error } = await supabase.rpc("admin_set_plan", {
      p_organization_id: input.organizationId,
      p_plan: input.plan,
      p_note: input.note,
    });
    if (error) throw fromPostgrestError(error);
    refresh();
    return null;
  },
});
