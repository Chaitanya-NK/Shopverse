import "server-only";

import { after } from "next/server";

import { env } from "@/env";
import { fromPostgrestError } from "@/lib/errors";
import { decryptSecret, encryptSecret } from "@/lib/payments/secrets";
import { createAdminClient } from "@/lib/supabase/admin";
import { type Json } from "@/types/database.types";

export type EnqueueOptions = {
  /** Wait this long before the first try. */
  delaySeconds?: number;
  /** A job with the same key that is still waiting or running makes this a no-op. */
  dedupeKey?: string;
  maxAttempts?: number;
  organizationId?: string | null;
  /** Start working on it right after this response (default true). */
  kick?: boolean;
};

/**
 * Put work on the queue. It's stored before this returns, so it survives a
 * crash; by default a worker also starts right after the response, so it
 * normally runs within a second. The scheduler picks up anything left over.
 */
export async function enqueueJob(
  kind: string,
  payload: Record<string, unknown>,
  options: EnqueueOptions = {},
) {
  const { data, error } = await createAdminClient().rpc("enqueue_job", {
    p_kind: kind,
    p_payload: payload as Json,
    p_delay_seconds: options.delaySeconds ?? 0,
    p_dedupe_key: options.dedupeKey ?? undefined,
    p_max_attempts: options.maxAttempts ?? 6,
    p_organization_id: options.organizationId ?? undefined,
  });
  if (error) throw fromPostgrestError(error);
  if (options.kick !== false && !options.delaySeconds) kickJobs();
  return data;
}

let kicked = false;
/** Run due jobs after the current response (once per request). */
export function kickJobs() {
  if (kicked) return;
  kicked = true;
  try {
    after(async () => {
      kicked = false;
      const { runJobs } = await import("@/lib/jobs/worker");
      await runJobs({ limit: 20, budgetMs: 15_000 });
    });
  } catch {
    // Outside a request (tests, scripts): the scheduler will run it.
    kicked = false;
  }
}

/**
 * Secrets in a payload (a delivery code) are encrypted when the server has an
 * encryption key. Finished jobs drop their payload either way.
 */
export function sealJobSecret(value: string): string {
  return env.PAYMENTS_ENCRYPTION_KEY ? `sealed:${encryptSecret(value)}` : value;
}
export function openJobSecret(value: string): string {
  return value.startsWith("sealed:") ? decryptSecret(value.slice(7)) : value;
}
