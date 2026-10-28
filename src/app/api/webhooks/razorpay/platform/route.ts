import { z } from "zod";

import { env } from "@/env";
import { handlePlatformEvent } from "@/features/billing/server";
import { logger } from "@/lib/logger";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BODY = 1_000_000;
const json = (status: number, body: object) => Response.json(body, { status });

const subscriptionEntity = z
  .object({
    id: z.string(),
    plan_id: z.string(),
    status: z.enum([
      "created",
      "authenticated",
      "active",
      "pending",
      "halted",
      "cancelled",
      "completed",
      "expired",
    ]),
    current_start: z.number().nullable().optional().default(null),
    current_end: z.number().nullable().optional().default(null),
    short_url: z.string().nullable().optional(),
  })
  .passthrough();
const eventSchema = z.object({
  event: z.string(),
  payload: z.object({
    subscription: z.object({ entity: subscriptionEntity }).optional(),
    payment: z
      .object({
        entity: z.object({ id: z.string(), amount: z.number(), status: z.string() }).passthrough(),
      })
      .optional(),
  }),
});

/**
 * Webhooks from Shopverse's own Razorpay account (plan subscriptions), signed
 * with PLATFORM_RAZORPAY_WEBHOOK_SECRET. Deliveries can repeat or arrive out of
 * order; each event is handled once and everything below is idempotent.
 */
export async function POST(request: Request) {
  const secret = env.PLATFORM_RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return json(404, { error: "not configured" });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json(413, { error: "too large" });
  if (!verifyWebhookSignature(secret, raw, request.headers.get("x-razorpay-signature") ?? "")) {
    logger.warn("Platform webhook with a bad signature");
    return json(400, { error: "invalid signature" });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "invalid json" });
  }
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) return json(200, { ignored: "unrecognised payload" });

  const admin = createAdminClient();
  const eventId = request.headers.get("x-razorpay-event-id");
  if (eventId) {
    const { data: isNew, error } = await admin.rpc("register_platform_webhook_event", {
      p_event_id: eventId,
      p_event: parsed.data.event,
    });
    if (error) return json(500, { error: "retry" });
    if (!isNew) return json(200, { duplicate: true });
  }

  try {
    const result = await handlePlatformEvent(
      parsed.data as Parameters<typeof handlePlatformEvent>[0],
    );
    return json(200, { result });
  } catch (cause) {
    logger.error({ err: cause, event: parsed.data.event }, "Platform webhook failed");
    // Let Razorpay retry this event.
    if (eventId) await admin.rpc("forget_platform_webhook_event", { p_event_id: eventId });
    return json(500, { error: "retry" });
  }
}
