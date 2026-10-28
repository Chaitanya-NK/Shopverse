import { z } from "zod";

import { getCredentials, settleCapture } from "@/features/payments/server";
import { logger } from "@/lib/logger";
import { fromPaise, verifyWebhookSignature } from "@/lib/payments/razorpay";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BODY = 1_000_000;

const paymentEntity = z.object({
  id: z.string(),
  order_id: z.string().nullable(),
  amount: z.number(),
  method: z.string().nullable().optional(),
  error_description: z.string().nullable().optional(),
});
const webhookSchema = z.object({
  event: z.string(),
  payload: z.object({ payment: z.object({ entity: paymentEntity }).optional() }).passthrough(),
});

const json = (status: number, body: object) => Response.json(body, { status });

/**
 * Razorpay webhooks for one business: /api/webhooks/razorpay/<organization id>.
 * Signed with that business's webhook secret over the raw body. Deliveries can
 * repeat or arrive out of order, so everything below is idempotent.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/webhooks/razorpay/[organizationId]">,
) {
  const { organizationId } = await ctx.params;
  if (!z.uuid().safeParse(organizationId).success) return json(404, { error: "not found" });

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json(413, { error: "too large" });
  const signature = request.headers.get("x-razorpay-signature") ?? "";

  const credentials = await getCredentials(organizationId).catch(() => null);
  if (!credentials?.webhookSecret) return json(404, { error: "not configured" });
  if (!verifyWebhookSignature(credentials.webhookSecret, raw, signature)) {
    logger.warn({ organizationId }, "Razorpay webhook with a bad signature");
    return json(400, { error: "invalid signature" });
  }

  const parsed = webhookSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) return json(200, { ignored: "unrecognised payload" });
  const { event, payload } = parsed.data;

  const admin = createAdminClient();
  const eventId = request.headers.get("x-razorpay-event-id");
  if (eventId) {
    const { data: isNew, error } = await admin.rpc("register_webhook_event", {
      p_event_id: eventId,
      p_organization_id: organizationId,
      p_event: event,
    });
    if (error) return json(500, { error: "retry" });
    if (!isNew) return json(200, { duplicate: true });
  }

  const payment = payload.payment?.entity;
  if (!payment?.order_id) return json(200, { ignored: event });

  // Only payments this business started through Shopverse.
  const { data: attempt } = await admin
    .from("payments")
    .select("id")
    .eq("provider_order_id", payment.order_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!attempt) return json(200, { ignored: "unknown order" });

  try {
    if (event === "payment.captured" || event === "order.paid") {
      const { result } = await settleCapture({
        razorpayOrderId: payment.order_id,
        paymentId: payment.id,
        amount: fromPaise(payment.amount),
        method: payment.method ?? null,
      });
      return json(200, { result });
    }
    if (event === "payment.failed") {
      await admin.rpc("record_payment_failed", {
        p_provider_order_id: payment.order_id,
        p_provider_payment_id: payment.id,
        p_reason: payment.error_description ?? "Payment failed",
      });
      return json(200, { recorded: "failed" });
    }
  } catch (cause) {
    logger.error({ err: cause, event, organizationId }, "Razorpay webhook handling failed");
    // Let Razorpay retry, and forget this event id so the retry is processed.
    if (eventId) await admin.rpc("forget_webhook_event", { p_event_id: eventId });
    return json(500, { error: "retry" });
  }
  return json(200, { ignored: event });
}
