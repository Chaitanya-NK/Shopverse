import "server-only";

import { z } from "zod";

import { getCredentials } from "@/features/payments/server";
import { AppError, Errors, fromPostgrestError, isAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { fromPaise, razorpay } from "@/lib/payments/razorpay";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ServerSupabaseClient } from "@/lib/supabase/server";

const planSchema = z.object({
  organization_id: z.uuid(),
  order_id: z.uuid(),
  return_id: z.uuid(),
  number: z.string(),
  payments: z.array(
    z.object({
      payment_id: z.uuid(),
      provider_payment_id: z.string(),
      amount: z.coerce.number(),
      already: z.coerce.number(),
    }),
  ),
});

const RETURN_NOTE = "shopverse_return_id";

const noteOf = (notes: unknown) =>
  notes && typeof notes === "object" && !Array.isArray(notes)
    ? (notes as Record<string, unknown>)[RETURN_NOTE]
    : undefined;

/**
 * Refund a received return to the original online payment(s).
 *
 * The database marks the refund as in progress first (so a double click can't
 * pay twice) and says how much to take from which payment. Before paying, we
 * ask the provider which refunds already carry this return's id: if an
 * earlier attempt went through but we never heard back, it is recorded rather
 * than paid again. Runs with the staff member's session, so only managers and
 * above can start it.
 */
export async function refundReturnToOriginal(supabase: ServerSupabaseClient, returnId: string) {
  const { data, error } = await supabase.rpc("start_return_refund", { p_return_id: returnId });
  if (error) throw fromPostgrestError(error);
  const plan = planSchema.parse(data);
  const admin = createAdminClient();

  try {
    const credentials = await getCredentials(plan.organization_id);
    if (!credentials)
      throw Errors.validation({}, "Connect your Razorpay account in Payments to refund online.");

    let refunded = 0;
    for (const item of plan.payments) {
      // Refunds for this return the provider already has (made, maybe not recorded).
      const existing = (
        await razorpay.listRefunds(credentials, item.provider_payment_id)
      ).items.filter((r) => noteOf(r.notes) === returnId);
      for (const r of existing) {
        await record(admin, returnId, item.payment_id, r.id, fromPaise(r.amount));
      }
      const done = existing.reduce((n, r) => n + fromPaise(r.amount), 0);
      const toPay = Math.round((item.amount - Math.max(done - item.already, 0)) * 100) / 100;
      if (toPay <= 0) continue;

      const refund = await razorpay.refund(credentials, item.provider_payment_id, toPay, {
        [RETURN_NOTE]: returnId,
        shopverse_order_id: plan.order_id,
        return_number: plan.number,
      });
      await record(admin, returnId, item.payment_id, refund.id, fromPaise(refund.amount));
      refunded += fromPaise(refund.amount);
    }
    return { refunded };
  } catch (cause) {
    const message = isAppError(cause) ? cause.message : "The refund didn't go through.";
    logger.error({ err: cause, returnId }, "Return refund failed");
    await admin.rpc("fail_return_refund", { p_return_id: returnId, p_error: message });
    throw isAppError(cause)
      ? cause
      : new AppError("UNAVAILABLE", "The refund didn't go through. Try again.", { cause });
  }
}

async function record(
  admin: ReturnType<typeof createAdminClient>,
  returnId: string,
  paymentId: string,
  refundId: string,
  amount: number,
) {
  const { error } = await admin.rpc("record_return_refund", {
    p_return_id: returnId,
    p_payment_id: paymentId,
    p_refund_id: refundId,
    p_amount: amount,
  });
  if (error) throw fromPostgrestError(error);
}
