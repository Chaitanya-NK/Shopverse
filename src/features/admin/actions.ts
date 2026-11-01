"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { isPlatformAdmin } from "@/features/admin/queries";
import { createAction } from "@/lib/actions/create-action";
import { kickJobs } from "@/lib/jobs/queue";
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

export const resolveError = createAction({
  name: "admin.resolveError",
  schema: z.object({ fingerprint: z.string().regex(/^[0-9a-f]{16,64}$/), resolved: z.boolean() }),
  handler: async (input, { supabase }) => {
    await requireAdmin();
    const { error } = await supabase.rpc("admin_resolve_error", {
      p_fingerprint: input.fingerprint,
      p_resolved: input.resolved,
    });
    if (error) throw fromPostgrestError(error);
    refresh();
    return null;
  },
});

export const retryJob = createAction({
  name: "admin.retryJob",
  schema: z.object({ id: z.number().int().positive() }),
  handler: async (input, { supabase }) => {
    await requireAdmin();
    const { error } = await supabase.rpc("admin_retry_job", { p_id: input.id });
    if (error) throw fromPostgrestError(error);
    kickJobs();
    refresh();
    return null;
  },
});
