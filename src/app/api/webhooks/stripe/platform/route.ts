import { z } from "zod";

import { env } from "@/env";
import { handlePlatformEvent, type PlatformEvent } from "@/features/billing/server";
import { logger } from "@/lib/logger";
import { verifyWebhookSignature } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BODY = 1_000_000;
const json = (status: number, body: object) => Response.json(body, { status });

const eventSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({ object: z.object({ id: z.string(), object: z.string() }).passthrough() }),
});

const HANDLED = /^(checkout\.session\.completed|customer\.subscription\.|invoice\.)/;

/**
 * Webhooks from Shopverse's own Stripe account (plan subscriptions), signed
 * with PLATFORM_STRIPE_WEBHOOK_SECRET. Deliveries can repeat or arrive out of
 * order; each event is handled once and the subscription is always re-read
 * from Stripe, so the order doesn't matter.
 */
export async function POST(request: Request) {
  const secret = env.PLATFORM_STRIPE_WEBHOOK_SECRET;
  if (!secret || !env.PLATFORM_STRIPE_SECRET_KEY) return json(404, { error: "not configured" });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json(413, { error: "too large" });
  if (!verifyWebhookSignature(secret, raw, request.headers.get("stripe-signature") ?? "")) {
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
  const event = parsed.data as PlatformEvent;
  if (!HANDLED.test(event.type)) return json(200, { ignored: event.type });

  const admin = createAdminClient();
  const { data: isNew, error } = await admin.rpc("register_platform_webhook_event", {
    p_event_id: event.id,
    p_event: event.type,
  });
  if (error) return json(500, { error: "retry" });
  if (!isNew) return json(200, { duplicate: true });

  try {
    return json(200, { result: await handlePlatformEvent(event) });
  } catch (cause) {
    logger.error({ err: cause, event: event.type }, "Platform webhook failed");
    // Let Stripe retry this event.
    await admin.rpc("forget_platform_webhook_event", { p_event_id: event.id });
    return json(500, { error: "retry" });
  }
}
