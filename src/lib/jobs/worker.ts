import "server-only";

import { randomUUID } from "node:crypto";

import { PermanentJobError } from "@/lib/jobs/errors";
import { captureError } from "@/lib/observability/capture";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export type JobHandler = (
  payload: Record<string, unknown>,
  job: { id: number; attempts: number },
) => Promise<void>;

export { PermanentJobError };

const WORKER = `web-${randomUUID().slice(0, 8)}`;

/**
 * Claim and run due jobs until none are left, the limit is reached or the
 * time budget runs out. Each job's success or failure is recorded; failures
 * retry with backoff and end up "dead" after their last attempt.
 */
export async function runJobs({ limit = 50, budgetMs = 50_000 } = {}) {
  const { HANDLERS } = await import("@/lib/jobs/handlers");
  const admin = createAdminClient();
  const started = Date.now();
  const result = { done: 0, retried: 0, dead: 0 };
  while (result.done + result.retried + result.dead < limit && Date.now() - started < budgetMs) {
    const { data, error } = await admin.rpc("claim_jobs", {
      p_worker: WORKER,
      p_limit: Math.min(10, limit - result.done - result.retried - result.dead),
    });
    if (error) {
      logger.error({ err: error }, "Claiming jobs failed");
      break;
    }
    if (!data || data.length === 0) break;
    for (const job of data) {
      const handler = HANDLERS[job.kind];
      try {
        if (!handler) throw new PermanentJobError(`No handler for "${job.kind}"`);
        await handler(job.payload as Record<string, unknown>, {
          id: job.id,
          attempts: job.attempts,
        });
        await admin.rpc("complete_job", { p_id: job.id });
        result.done++;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        const { data: outcome } = await admin.rpc("fail_job", {
          p_id: job.id,
          p_error: message,
          p_permanent: cause instanceof PermanentJobError,
        });
        if (outcome === "dead") {
          result.dead++;
          await captureError(cause, { source: "job", context: { kind: job.kind, jobId: job.id } });
        } else result.retried++;
        logger.warn({ err: cause, kind: job.kind, jobId: job.id, outcome }, "Job failed");
      }
    }
  }
  return result;
}
