import "server-only";

import { cache } from "react";
import { z } from "zod";

import { fromPostgrestError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const groupSchema = z.object({
  fingerprint: z.string(),
  source: z.enum(["server", "client", "job", "action"]),
  message: z.string(),
  first_seen: z.string(),
  last_seen: z.string(),
  count: z.number(),
  resolved_at: z.string().nullable(),
});
export type ErrorGroup = z.output<typeof groupSchema>;

export const ERROR_STATUSES = { open: "Open", resolved: "Resolved", all: "All" } as const;
export type ErrorStatus = keyof typeof ERROR_STATUSES;

export const listErrors = cache(async (status: ErrorStatus) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_errors", { p_status: status });
  if (error) throw fromPostgrestError(error);
  return z
    .object({ open: z.number(), last_24h: z.number(), groups: z.array(groupSchema) })
    .parse(data);
});

const eventSchema = z.object({
  id: z.number(),
  created_at: z.string(),
  message: z.string(),
  stack: z.string().nullable(),
  path: z.string().nullable(),
  method: z.string().nullable(),
  request_id: z.string().nullable(),
  digest: z.string().nullable(),
  user_id: z.string().nullable(),
  context: z.record(z.string(), z.unknown()),
});
export type ErrorEvent = z.output<typeof eventSchema>;

export const getError = cache(async (fingerprint: string) => {
  if (!/^[0-9a-f]{16,64}$/.test(fingerprint)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_error", { p_fingerprint: fingerprint });
  if (error) throw fromPostgrestError(error);
  return data ? groupSchema.extend({ events: z.array(eventSchema) }).parse(data) : null;
});

const jobSchema = z.object({
  id: z.number(),
  kind: z.string(),
  status: z.enum(["queued", "running", "done", "dead"]),
  attempts: z.number(),
  max_attempts: z.number(),
  last_error: z.string().nullable(),
  run_after: z.string(),
  created_at: z.string(),
  finished_at: z.string().nullable(),
});
export type JobRow = z.output<typeof jobSchema>;

export const getJobs = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_jobs");
  if (error) throw fromPostgrestError(error);
  return z
    .object({
      counts: z.object({
        queued: z.number(),
        due: z.number(),
        running: z.number(),
        dead: z.number(),
        done_24h: z.number(),
      }),
      oldest_due: z.string().nullable(),
      by_kind: z.record(z.string(), z.number()),
      problems: z.array(jobSchema),
    })
    .parse(data);
});
