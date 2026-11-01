import "server-only";

import { timingSafeEqual } from "node:crypto";

import { env } from "@/env";

/** "Authorization: Bearer <CRON_SECRET>", compared in constant time. */
export function isCronRequest(request: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
