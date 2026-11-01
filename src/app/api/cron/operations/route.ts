import { timingSafeEqual } from "node:crypto";

import { env } from "@/env";
import { runOperationsJobs } from "@/features/operations/server";
import { logger } from "@/lib/logger";

const json = (status: number, body: object) => Response.json(body, { status });

function authorized(request: Request) {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * The operations scheduler: emails new low-stock alerts and any daily digests
 * that are due. Safe to call as often as you like (every 15 minutes is
 * plenty); work is claimed in the database so nothing goes out twice.
 */
async function handle(request: Request) {
  if (!env.CRON_SECRET) return json(404, { error: "not configured" });
  if (!authorized(request)) return json(401, { error: "unauthorized" });
  try {
    return json(200, await runOperationsJobs());
  } catch (cause) {
    logger.error({ err: cause }, "Operations jobs failed");
    return json(500, { error: "failed" });
  }
}

export const GET = handle;
export const POST = handle;
