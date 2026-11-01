import { env } from "@/env";
import { runOperationsJobs } from "@/features/operations/server";
import { isCronRequest } from "@/lib/cron";
import { runJobs } from "@/lib/jobs/worker";
import { logger } from "@/lib/logger";

const json = (status: number, body: object) => Response.json(body, { status });

/**
 * The operations scheduler: emails new low-stock alerts and any daily digests
 * that are due. Safe to call as often as you like (every 15 minutes is
 * plenty); work is claimed in the database so nothing goes out twice.
 */
async function handle(request: Request) {
  if (!env.CRON_SECRET) return json(404, { error: "not configured" });
  if (!isCronRequest(request)) return json(401, { error: "unauthorized" });
  try {
    const operations = await runOperationsJobs();
    // Also a chance to run queued jobs, for setups with only this scheduler.
    const jobs = await runJobs({ limit: 100, budgetMs: 30_000 });
    return json(200, { ...operations, jobs });
  } catch (cause) {
    logger.error({ err: cause }, "Operations jobs failed");
    return json(500, { error: "failed" });
  }
}

export const GET = handle;
export const POST = handle;
