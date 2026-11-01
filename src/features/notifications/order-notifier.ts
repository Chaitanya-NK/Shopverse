import "server-only";

import { env } from "@/env";
import { routes } from "@/config/routes";
import {
  type OrderEmailContext,
  type OrderEmailEvent,
  orderEventEmail,
} from "@/features/notifications/templates";
import { REFUND_METHOD_LABELS, type RefundMethod } from "@/features/returns/schemas";
import { enqueueJob, openJobSecret, sealJobSecret } from "@/lib/jobs/queue";
import { PermanentJobError } from "@/lib/jobs/errors";
import { sendMail } from "@/lib/mail";
import { isLocale } from "@/i18n/core";
import { translator } from "@/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";

type ShipmentEvent = "shipped" | "out_for_delivery" | "delivery_failed" | "delivered";

const url = (path: string) => new URL(path, env.NEXT_PUBLIC_APP_URL).toString();

async function loadContext(orderId: string): Promise<OrderEmailContext | null> {
  const { data, error } = await createAdminClient()
    .from("orders")
    .select(
      `number, locale, public_token, grand_total, shipping_total, discount_total, discount_code, currency, payment_method, invoice_number,
       shop:shops!orders_organization_id_shop_id_fkey (name, slug, settings),
       customer:customers (email, full_name),
       order_items (title, quantity, total, created_at)`,
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.customer?.email || !data.shop) return null;

  const settings = (data.shop.settings ?? {}) as Record<string, unknown>;
  // Shops can turn order emails off (codes for checkout and sign-in still go).
  if (settings.notify_customers === false) return null;
  const str = (k: string) => (typeof settings[k] === "string" ? (settings[k] as string) : null);

  const locale = isLocale(data.locale)
    ? data.locale
    : isLocale(settings.language)
      ? settings.language
      : "en";
  return {
    t: translator(locale),
    to: data.customer.email,
    customerName: data.customer.full_name,
    shopName: data.shop.name,
    supportEmail: str("support_email"),
    supportPhone: str("support_phone"),
    orderNumber: data.number,
    orderUrl: url(routes.storefrontOrder(data.shop.slug, data.public_token)),
    invoiceUrl: data.invoice_number
      ? url(routes.storefrontInvoice(data.shop.slug, data.public_token))
      : null,
    total: Number(data.grand_total),
    shipping: Number(data.shipping_total),
    discount:
      Number(data.discount_total) > 0
        ? { amount: Number(data.discount_total), code: data.discount_code }
        : null,
    currency: data.currency,
    cashOnDelivery: data.payment_method === "cod",
    items: [...data.order_items]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((i) => ({ title: i.title, quantity: i.quantity, total: Number(i.total) })),
  };
}

// ---------------------------------------------------------------------------
// Enqueueing: called by actions. The work happens in background jobs, so
// staff and shoppers never wait on (or see failures from) the mail server or
// the messaging provider, and failed sends are retried.
// ---------------------------------------------------------------------------

/** Email (and message) the customer about their order. */
export async function notifyOrder(
  orderId: string,
  event: { type: "confirmed" } | { type: "cancelled"; byCustomer: boolean },
) {
  await enqueueJob("order.email", { orderId, event });
  await enqueueJob("order.message", { orderId, type: event.type }, { maxAttempts: 3 });
}

/** Shipment events; `otp` is required when the parcel goes out for delivery. */
export async function notifyShipment(shipmentId: string, type: ShipmentEvent, otp?: string | null) {
  await enqueueJob("shipment.notify", {
    shipmentId,
    type,
    otp: otp ? sealJobSecret(otp) : null,
  });
}

type ReturnNotice = "requested" | "approved" | "rejected" | "received" | "refunded";

/** Email the customer about a return. */
export async function notifyReturn(returnId: string, notice: ReturnNotice) {
  await enqueueJob("return.notify", { returnId, notice });
}

// ---------------------------------------------------------------------------
// Job handlers
// ---------------------------------------------------------------------------

/** order.email: render and send one order email. Throws so the job retries. */
export async function runOrderEmailJob(payload: Record<string, unknown>) {
  const orderId = String(payload.orderId ?? "");
  const event = payload.event as OrderEmailEvent | undefined;
  if (!orderId || !event?.type) throw new PermanentJobError("Bad order email job");
  const sealed = event.type === "out_for_delivery" ? event.otp : null;
  const ready = sealed ? ({ ...event, otp: openJobSecret(sealed) } as OrderEmailEvent) : event;
  const context = await loadContext(orderId);
  if (!context) return;
  await sendMail(orderEventEmail(context, ready));
}

/** shipment.notify: look the parcel up, then queue its email and message. */
export async function runShipmentJob(payload: Record<string, unknown>) {
  const shipmentId = String(payload.shipmentId ?? "");
  const type = payload.type as ShipmentEvent;
  const otp = typeof payload.otp === "string" ? payload.otp : null;
  const { data, error } = await createAdminClient()
    .from("shipments")
    .select("order_id, number, tracking_token, carrier, tracking_number")
    .eq("id", shipmentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return;
  const shipmentNumber = data.number ?? "your parcel";
  const trackingUrl = url(routes.tracking(data.tracking_token));
  // The code stays sealed until the email or message is actually sent.
  const event: OrderEmailEvent | null =
    type === "shipped"
      ? {
          type,
          shipmentNumber,
          trackingUrl,
          carrier: data.carrier,
          trackingNumber: data.tracking_number,
        }
      : type === "out_for_delivery"
        ? otp
          ? { type, shipmentNumber, trackingUrl, otp }
          : null
        : type === "delivery_failed"
          ? { type, shipmentNumber, trackingUrl }
          : { type: "delivered", shipmentNumber };
  if (event) await enqueueJob("order.email", { orderId: data.order_id, event }, { kick: false });
  await enqueueJob(
    "order.message",
    { orderId: data.order_id, type, trackingUrl, otp },
    { maxAttempts: 3, kick: false },
  );
}

/** return.notify: build the return's email and queue it. */
export async function runReturnJob(payload: Record<string, unknown>) {
  const returnId = String(payload.returnId ?? "");
  const notice = payload.notice as ReturnNotice;
  const { data, error } = await createAdminClient()
    .from("returns")
    .select(
      `order_id, number, resolution, staff_note, refund_amount, refunded_amount, refund_method, credit_note_number,
       order:orders!returns_organization_id_order_id_fkey (public_token, shop:shops!orders_organization_id_shop_id_fkey (slug)),
       return_items (quantity, order_item:order_items (title))`,
    )
    .eq("id", returnId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return;
  const creditNoteUrl =
    data.credit_note_number && data.order?.shop
      ? url(routes.storefrontCreditNote(data.order.shop.slug, data.order.public_token, returnId))
      : null;
  const exchange = data.resolution === "exchange";
  const event: OrderEmailEvent =
    notice === "requested"
      ? {
          type: "return_requested",
          returnNumber: data.number,
          exchange,
          items: data.return_items.map((i) => `${i.quantity} × ${i.order_item?.title ?? "item"}`),
        }
      : notice === "approved"
        ? { type: "return_approved", returnNumber: data.number, note: data.staff_note }
        : notice === "rejected"
          ? { type: "return_rejected", returnNumber: data.number, note: data.staff_note }
          : notice === "received"
            ? {
                type: "return_received",
                returnNumber: data.number,
                exchange,
                refundAmount: Number(data.refund_amount),
                creditNoteUrl,
              }
            : {
                type: "return_refunded",
                returnNumber: data.number,
                amount: Number(data.refunded_amount),
                method: REFUND_METHOD_LABELS[(data.refund_method ?? "original") as RefundMethod],
              };
  await enqueueJob("order.email", { orderId: data.order_id, event }, { kick: false });
}
