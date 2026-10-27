import "server-only";

import { cache } from "react";

import { invoiceSchema } from "@/features/invoices/schemas";
import { fromPostgrestError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Staff view (RLS-checked in the function). Null until the invoice is issued. */
export const getOrderInvoice = cache(async (orderId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("order_invoice", { p_order_id: orderId });
  if (error) throw fromPostgrestError(error);
  return data ? invoiceSchema.parse(data) : null;
});

/**
 * Shopper view by the order's private link. The street address and phone are
 * included only when the signed-in shopper owns the order.
 */
export const getStorefrontInvoice = cache(async (orderToken: string, fullBuyer: boolean) => {
  if (!/^[0-9a-f]{32}$/.test(orderToken)) return null;
  const { data, error } = await createAdminClient().rpc("storefront_invoice", {
    p_token: orderToken,
    p_full_buyer: fullBuyer,
  });
  if (error) throw fromPostgrestError(error);
  return data ? invoiceSchema.parse(data) : null;
});
