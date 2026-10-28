import "server-only";

import { cache } from "react";

import { type DiscountSummary } from "@/features/discounts/schemas";
import { fromPostgrestError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export const listDiscounts = cache(async (organizationId: string): Promise<DiscountSummary[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("discount_overview")
    .select(
      "id, code, title, kind, value, max_discount, min_subtotal, starts_at, ends_at, usage_limit, per_customer_limit, first_order_only, shop_ids, is_active, uses, total_saved, state",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw fromPostgrestError(error);
  return data.map((d) => ({
    id: d.id!,
    code: d.code,
    title: d.title!,
    kind: d.kind as DiscountSummary["kind"],
    value: Number(d.value ?? 0),
    maxDiscount: d.max_discount === null ? null : Number(d.max_discount),
    minSubtotal: d.min_subtotal === null ? null : Number(d.min_subtotal),
    startsAt: d.starts_at!,
    endsAt: d.ends_at,
    usageLimit: d.usage_limit,
    perCustomerLimit: d.per_customer_limit,
    firstOrderOnly: Boolean(d.first_order_only),
    shopIds: d.shop_ids,
    isActive: Boolean(d.is_active),
    uses: Number(d.uses ?? 0),
    totalSaved: Number(d.total_saved ?? 0),
    state: d.state as DiscountSummary["state"],
  }));
});
