import "server-only";

import { cache } from "react";

import { paymentSettingsViewSchema } from "@/features/payments/schemas";
import { fromPostgrestError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export const getPaymentSettings = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_payment_settings", {
    p_organization_id: organizationId,
  });
  if (error) throw fromPostgrestError(error);
  return paymentSettingsViewSchema.parse(data);
});

export type OrderPayment = {
  id: string;
  providerOrderId: string;
  providerPaymentId: string | null;
  amount: number;
  refundedAmount: number;
  currency: string;
  status: "created" | "captured" | "failed" | "refunded" | "partially_refunded";
  method: string | null;
  error: string | null;
  refundDue: boolean;
  createdAt: string;
};

/** An order's payment attempts (RLS: staff with access to the shop). */
export const listOrderPayments = cache(async (orderId: string): Promise<OrderPayment[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, provider_order_id, provider_payment_id, amount, refunded_amount, currency, status, method, error, refund_due, created_at",
    )
    .eq("order_id", orderId)
    .order("created_at");
  if (error) throw fromPostgrestError(error);
  return data.map((p) => ({
    id: p.id,
    providerOrderId: p.provider_order_id,
    providerPaymentId: p.provider_payment_id,
    amount: Number(p.amount),
    refundedAmount: Number(p.refunded_amount),
    currency: p.currency,
    status: p.status as OrderPayment["status"],
    method: p.method,
    error: p.error,
    refundDue: p.refund_due,
    createdAt: p.created_at,
  }));
});
