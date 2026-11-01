import { z } from "zod";

import { getCredentials } from "@/features/payments/server";
import { enqueueJob } from "@/lib/jobs/queue";
import { logger } from "@/lib/logger";
import { idOf, verifyWebhookSignature } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BODY = 1_000_000;

const eventSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({
    object: z
      .object({
        id: z.string(),
        object: z.string(),
        payment_intent: z.union([z.string(), z.object({ id: z.string() })]).nullish(),
      })
      .passthrough(),
  }),
});

const json = (status: number, body: object) => Response.json(body, { status });

/**
 * Stripe webhooks for one business: /api/webhooks/stripe/<organization id>.
 * Signed with that endpoint's signing secret. Deliveries can repeat or arrive
 * out of order, so handling is idempotent, and the payment itself is always
 * read back from Stripe before an order is confirmed (see runStripeEventJob).
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/webhooks/stripe/[organizationId]">,
) {
  const { organizationId } = await ctx.params;
  if (!z.uuid().safeParse(organizationId).success) return json(404, { error: "not found" });

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json(413, { error: "too large" });
  const signature = request.headers.get("stripe-signature") ?? "";

  const credentials = await getCredentials(organizationId).catch(() => null);
  if (!credentials?.webhookSecret) return json(404, { error: "not configured" });
  if (!verifyWebhookSignature(credentials.webhookSecret, raw, signature)) {
    logger.warn({ organizationId }, "Stripe webhook with a bad signature");
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
  const { id: eventId, type, data } = parsed.data;
  const session = data.object;
  if (session.object !== "checkout.session") return json(200, { ignored: type });

  const admin = createAdminClient();
  // Only Checkout Sessions this business started through Shopverse.
  const { data: attempt } = await admin
    .from("payments")
    .select("id")
    .eq("provider_order_id", session.id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!attempt) return json(200, { ignored: "unknown session" });

  const { data: isNew, error } = await admin.rpc("register_webhook_event", {
    p_event_id: eventId,
    p_organization_id: organizationId,
    p_event: type,
  });
  if (error) return json(500, { error: "retry" });
  if (!isNew) return json(200, { duplicate: true });

  // Handled by a background job (retried with backoff if it fails), so Stripe
  // gets its answer straight away.
  try {
    await enqueueJob(
      "stripe.event",
      {
        organizationId,
        eventId,
        type,
        sessionId: session.id,
        paymentIntent: idOf(session.payment_intent) ?? null,
      },
      { dedupeKey: `stripe:${eventId}`, organizationId, maxAttempts: 8 },
    );
  } catch (cause) {
    logger.error({ err: cause, type, organizationId }, "Queueing a Stripe event failed");
    // Let Stripe retry, and forget this event id so the retry is processed.
    await admin.rpc("forget_webhook_event", { p_event_id: eventId });
    return json(500, { error: "retry" });
  }
  return json(200, { queued: type });
}
