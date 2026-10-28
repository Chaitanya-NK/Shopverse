import "server-only";

import { cache } from "react";
import { z } from "zod";

import { invoiceSchema } from "@/features/invoices/schemas";
import { RETURNS_PAGE_SIZE } from "@/features/returns/search-params";
import {
  type RefundMethod,
  type RefundStatus,
  type Resolution,
  type ReturnReason,
  returnOptionsSchema,
  type ReturnStatus,
} from "@/features/returns/schemas";
import { RETURN_VIEW_IDS, RETURN_VIEWS, type ReturnView } from "@/features/returns/views";
import { readShopperToken } from "@/features/shopper/session";
import { fromPostgrestError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ReturnRow = {
  id: string;
  number: string;
  orderId: string;
  orderNumber: string;
  shopName: string;
  customerName: string | null;
  source: "customer" | "staff" | "rto";
  status: ReturnStatus;
  resolution: Resolution;
  reason: ReturnReason;
  itemCount: number;
  itemTitles: string;
  creditTotal: number;
  refundAmount: number;
  refundStatus: RefundStatus | null;
  currency: string;
  createdAt: string;
};

export const listReturns = cache(
  async (organizationId: string, view: ReturnView, shopId: string | null, page: number) => {
    const supabase = await createClient();
    const from = (Math.max(1, page) - 1) * RETURNS_PAGE_SIZE;
    let query = supabase
      .from("return_overview")
      .select(
        "id, number, order_id, order_number, shop_name, customer_name, source, status, resolution, reason, item_count, item_titles, credit_total, refund_amount, refund_status, currency, created_at",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .in("status", [...RETURN_VIEWS[view].statuses]);
    if (shopId) query = query.eq("shop_id", shopId);
    const { data, error, count } = await query
      .order("created_at", { ascending: view === "review" || view === "pickup" })
      .order("id")
      .range(from, from + RETURNS_PAGE_SIZE - 1);
    if (error) throw fromPostgrestError(error);
    const total = count ?? 0;
    return {
      total,
      page: Math.max(1, page),
      pageCount: Math.max(1, Math.ceil(total / RETURNS_PAGE_SIZE)),
      items: data.map((r): ReturnRow => ({
        id: r.id,
        number: r.number,
        orderId: r.order_id,
        orderNumber: r.order_number,
        shopName: r.shop_name,
        customerName: r.customer_name,
        source: r.source as ReturnRow["source"],
        status: r.status,
        resolution: r.resolution as Resolution,
        reason: r.reason as ReturnReason,
        itemCount: r.item_count ?? 0,
        itemTitles: r.item_titles ?? "",
        creditTotal: Number(r.credit_total),
        refundAmount: Number(r.refund_amount),
        refundStatus: r.refund_status as RefundStatus | null,
        currency: r.currency,
        createdAt: r.created_at,
      })),
    };
  },
);

/** How many returns sit in each tab. */
export const countReturns = cache(async (organizationId: string, shopId: string | null) => {
  const supabase = await createClient();
  let query = supabase
    .from("returns")
    .select("status")
    .eq("organization_id", organizationId)
    .limit(5000);
  if (shopId) query = query.eq("shop_id", shopId);
  const { data, error } = await query;
  if (error) throw fromPostgrestError(error);
  return Object.fromEntries(
    RETURN_VIEW_IDS.map((id) => [
      id,
      data.filter((r) => (RETURN_VIEWS[id].statuses as readonly string[]).includes(r.status))
        .length,
    ]),
  ) as Record<ReturnView, number>;
});

export const countReturnsToReview = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("returns")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "requested");
  if (error) throw fromPostgrestError(error);
  return count ?? 0;
});

export type ReturnDetail = NonNullable<Awaited<ReturnType<typeof getReturn>>>;

export const getReturn = cache(async (organizationId: string, returnId: string) => {
  const supabase = await createClient();
  const { data: r, error } = await supabase
    .from("returns")
    .select(
      `id, number, shop_id, order_id, source, status, resolution, reason, note, refund_upi, staff_note,
       credit_total, shipping_credit, refund_amount, refunded_amount, refund_status, refund_method, refund_reference,
       refund_error, refund_started_at, credit_note_number, credit_note_at, exchange_order_id,
       created_at, approved_at, picked_up_at, received_at, completed_at, rejected_at, cancelled_at,
       return_items (id, order_item_id, quantity, restock, serial_numbers, total, discount_amount, tax_amount,
         exchange:product_variants (title),
         order_item:order_items (title, sku, unit_price, quantity, tracking, discount_amount, total)),
       return_refunds (provider_refund_id, amount, created_at)`,
    )
    .eq("organization_id", organizationId)
    .eq("id", returnId)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!r) return null;

  const [{ data: order, error: orderError }, { data: shipped, error: shippedError }, exchange] =
    await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, number, currency, payment_method, payment_status, grand_total, shipping_address, invoice_number, customer:customers (full_name, email, phone), shop:shops!orders_organization_id_shop_id_fkey (name)",
        )
        .eq("id", r.order_id)
        .single(),
      // Serial numbers delivered for each line (to pick which came back).
      supabase
        .from("shipment_items")
        .select("order_item_id, serial_numbers, shipment:shipments!inner (status)")
        .in(
          "order_item_id",
          r.return_items.map((i) => i.order_item_id),
        )
        .eq("shipment.status", "delivered"),
      r.exchange_order_id
        ? supabase.from("orders").select("id, number").eq("id", r.exchange_order_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
  if (orderError) throw fromPostgrestError(orderError);
  if (shippedError) throw fromPostgrestError(shippedError);

  const serialsFor = (orderItemId: string) => [
    ...new Set(
      shipped.filter((s) => s.order_item_id === orderItemId).flatMap((s) => s.serial_numbers),
    ),
  ];
  const address = (order.shipping_address ?? {}) as Record<string, string | undefined>;

  return {
    id: r.id,
    number: r.number,
    source: r.source as "customer" | "staff" | "rto",
    status: r.status,
    resolution: r.resolution as Resolution,
    reason: r.reason as ReturnReason,
    note: r.note,
    refundUpi: r.refund_upi,
    staffNote: r.staff_note,
    creditTotal: Number(r.credit_total),
    shippingCredit: Number(r.shipping_credit),
    refundAmount: Number(r.refund_amount),
    refundedAmount: Number(r.refunded_amount),
    refundStatus: r.refund_status as RefundStatus | null,
    refundMethod: r.refund_method as RefundMethod | null,
    refundReference: r.refund_reference,
    refundError: r.refund_error,
    /** A refund that stopped half way can be retried after 10 minutes. */
    refundStuck:
      r.refund_status === "processing" &&
      r.refund_started_at !== null &&
      Date.now() - new Date(r.refund_started_at).getTime() > 10 * 60_000,
    creditNoteNumber: r.credit_note_number,
    creditNoteAt: r.credit_note_at,
    exchangeOrder: exchange.data ? { id: exchange.data.id, number: exchange.data.number } : null,
    timeline: {
      createdAt: r.created_at,
      approvedAt: r.approved_at,
      pickedUpAt: r.picked_up_at,
      receivedAt: r.received_at,
      completedAt: r.completed_at,
      rejectedAt: r.rejected_at,
      cancelledAt: r.cancelled_at,
    },
    items: r.return_items.map((i) => ({
      id: i.id,
      title: i.order_item?.title ?? "Item",
      sku: i.order_item?.sku ?? "",
      quantity: i.quantity,
      tracking: i.order_item?.tracking ?? "quantity",
      unitPaid: i.order_item
        ? Math.round(
            ((Number(i.order_item.total) - Number(i.order_item.discount_amount)) /
              i.order_item.quantity) *
              100,
          ) / 100
        : 0,
      value: i.total === null ? null : Number(i.total) - Number(i.discount_amount ?? 0),
      restock: i.restock,
      serialNumbers: i.serial_numbers,
      shippedSerials: serialsFor(i.order_item_id),
      exchangeFor: i.exchange?.title ?? null,
    })),
    refunds: r.return_refunds.map((x) => ({
      id: x.provider_refund_id,
      amount: Number(x.amount),
      at: x.created_at,
    })),
    order: {
      id: order.id,
      number: order.number,
      currency: order.currency,
      paymentMethod: order.payment_method,
      paymentStatus: order.payment_status,
      grandTotal: Number(order.grand_total),
      invoiceNumber: order.invoice_number,
      shopName: order.shop?.name ?? "",
      customer: {
        name: order.customer?.full_name ?? address.name ?? null,
        email: order.customer?.email ?? null,
        phone: order.customer?.phone ?? address.phone ?? null,
      },
      address: [address.line1, address.line2, address.city, address.state, address.postal_code]
        .filter(Boolean)
        .join(", "),
    },
  };
});

/** Returns on one order, for the staff order page. */
export const listOrderReturns = cache(async (orderId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("return_overview")
    .select(
      "id, number, status, resolution, item_titles, item_count, credit_total, refund_status, currency, created_at",
    )
    .eq("order_id", orderId)
    .order("created_at");
  if (error) throw fromPostgrestError(error);
  return data.map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status,
    resolution: r.resolution as Resolution,
    itemTitles: r.item_titles ?? "",
    itemCount: r.item_count ?? 0,
    creditTotal: Number(r.credit_total),
    refundStatus: r.refund_status as RefundStatus | null,
    currency: r.currency,
    createdAt: r.created_at,
  }));
});

export const getOrderReturnOptions = cache(async (orderId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("order_return_options", { p_order_id: orderId });
  if (error) throw fromPostgrestError(error);
  return returnOptionsSchema.parse(data);
});

/** Shopper: what they can return from their order (null if not theirs / signed out). */
export const getShopperReturnOptions = cache(async (shopId: string, orderToken: string) => {
  const token = await readShopperToken();
  if (!token) return null;
  const { data, error } = await createAdminClient().rpc("shopper_return_options", {
    p_shop_id: shopId,
    p_token: token,
    p_order_token: orderToken,
  });
  if (error) {
    if (error.code === "P0002" || error.code === "42501") return null;
    throw fromPostgrestError(error);
  }
  return returnOptionsSchema.parse(data);
});

const creditNoteExtraSchema = z
  .object({
    against: z.object({ number: z.string().nullable(), issued_at: z.string().nullable() }),
    return_number: z.string(),
    reason: z.string(),
  })
  .transform((c) => ({
    againstNumber: c.against.number,
    againstDate: c.against.issued_at,
    returnNumber: c.return_number,
    reason: c.reason as ReturnReason,
  }));
export type CreditNoteInfo = z.output<typeof creditNoteExtraSchema>;

function parseCreditNote(data: unknown) {
  if (!data) return null;
  return { document: invoiceSchema.parse(data), creditNote: creditNoteExtraSchema.parse(data) };
}

export const getReturnCreditNote = cache(async (returnId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("return_credit_note", { p_return_id: returnId });
  if (error) throw fromPostgrestError(error);
  return parseCreditNote(data);
});

export const getStorefrontCreditNote = cache(
  async (orderToken: string, returnId: string, fullBuyer: boolean) => {
    if (!/^[0-9a-f]{32}$/.test(orderToken)) return null;
    const { data, error } = await createAdminClient().rpc("storefront_credit_note", {
      p_order_token: orderToken,
      p_return_id: returnId,
      p_full_buyer: fullBuyer,
    });
    if (error) throw fromPostgrestError(error);
    return parseCreditNote(data);
  },
);

/** Credit notes issued in a month ("YYYY-MM"), for GST reports. */
export const getMonthCreditNotes = cache(
  async (organizationId: string, month: string, shopId: string | null) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("gst_credit_notes", {
      p_organization_id: organizationId,
      p_month: `${month}-01`,
      ...(shopId ? { p_shop_id: shopId } : {}),
    });
    if (error) throw fromPostgrestError(error);
    return z
      .array(z.unknown())
      .parse(data ?? [])
      .map((d) => parseCreditNote(d)!);
  },
);

export const returnsReportSchema = z.object({
  requested: z.number(),
  received: z.number(),
  undelivered: z.number(),
  credited: z.coerce.number(),
  refunded: z.coerce.number(),
  open: z.number(),
});

export const getReturnsReport = cache(
  async (organizationId: string, from: string, to: string, shopId: string | null) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("returns_report", {
      p_organization_id: organizationId,
      p_from: from,
      p_to: to,
      ...(shopId ? { p_shop_id: shopId } : {}),
    });
    if (error) throw fromPostgrestError(error);
    return returnsReportSchema.parse(data);
  },
);
