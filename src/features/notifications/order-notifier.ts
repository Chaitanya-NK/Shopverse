import "server-only";

import { after } from "next/server";

import { env } from "@/env";
import { routes } from "@/config/routes";
import {
  type OrderEmailContext,
  type OrderEmailEvent,
  orderEventEmail,
} from "@/features/notifications/templates";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { createAdminClient } from "@/lib/supabase/admin";

type ShipmentEvent = "shipped" | "out_for_delivery" | "delivery_failed" | "delivered";

const url = (path: string) => new URL(path, env.NEXT_PUBLIC_APP_URL).toString();

async function loadContext(orderId: string): Promise<OrderEmailContext | null> {
  const { data, error } = await createAdminClient()
    .from("orders")
    .select(
      `number, public_token, grand_total, shipping_total, discount_total, discount_code, currency, payment_method, invoice_number,
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

  return {
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

async function deliver(orderId: string, event: OrderEmailEvent) {
  try {
    const context = await loadContext(orderId);
    if (!context) return;
    await sendMail(orderEventEmail(context, event));
  } catch (cause) {
    // Emails are a courtesy: the order change already happened.
    logger.warn({ err: cause, orderId, event: event.type }, "Order email failed");
  }
}

/**
 * Email the customer about their order after the response is sent, so staff
 * and shoppers never wait on (or see failures from) the mail server.
 */
export function notifyOrder(
  orderId: string,
  event: { type: "confirmed" } | { type: "cancelled"; byCustomer: boolean },
) {
  after(() => deliver(orderId, event));
}

/** Shipment events; `otp` is required when the parcel goes out for delivery. */
export function notifyShipment(shipmentId: string, type: ShipmentEvent, otp?: string | null) {
  after(async () => {
    try {
      const { data, error } = await createAdminClient()
        .from("shipments")
        .select("order_id, number, tracking_token, carrier, tracking_number")
        .eq("id", shipmentId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return;
      const shipmentNumber = data.number ?? "your parcel";
      const trackingUrl = url(routes.tracking(data.tracking_token));
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
      if (event) await deliver(data.order_id, event);
    } catch (cause) {
      logger.warn({ err: cause, shipmentId, event: type }, "Shipment email failed");
    }
  });
}
