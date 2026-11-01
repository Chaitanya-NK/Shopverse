import { env } from "@/env";
import { isCronRequest } from "@/lib/cron";
import { runJobs } from "@/lib/jobs/worker";
import { logger } from "@/lib/logger";

const json = (status: number, body: object) => Response.json(body, { status });

/**
 * The background job worker: runs whatever is due (emails, messages, Stripe
 * events) for up to ~50 seconds. Jobs normally start right after the request
 * that queued them; this catches retries and anything left behind. Call it
 * every few minutes with "Authorization: Bearer <CRON_SECRET>".
 */
async function handle(request: Request) {
  if (!env.CRON_SECRET) return json(404, { error: "not configured" });
  if (!isCronRequest(request)) return json(401, { error: "unauthorized" });
  try {
    return json(200, await runJobs({ limit: 200, budgetMs: 50_000 }));
  } catch (cause) {
    logger.error({ err: cause }, "Job worker failed");
    return json(500, { error: "failed" });
  }
}

export const GET = handle;
export const POST = handle;
export const maxDuration = 60;
