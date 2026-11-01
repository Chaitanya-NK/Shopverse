/** Order updates by WhatsApp or SMS: short, plain text, one link. */

import { makeTranslate, type Translate } from "@/i18n/core";

export const MESSAGE_EVENTS = {
  confirmed: "Order confirmed",
  shipped: "Shipped (with tracking link)",
  out_for_delivery: "Out for delivery (with the delivery code)",
  delivery_failed: "Delivery missed",
  delivered: "Delivered",
  cancelled: "Cancelled",
} as const;
export type MessageEvent = keyof typeof MESSAGE_EVENTS;
export const MESSAGE_EVENT_IDS = Object.keys(MESSAGE_EVENTS) as MessageEvent[];

export type MessageContext = {
  shopName: string;
  customerName: string | null;
  orderNumber: string;
  total: string;
  orderUrl: string;
  trackingUrl?: string | null;
  otp?: string | null;
};

const english = makeTranslate("en", null);

/** The message for one event, in the customer's language (English by default). */
export function messageBody(
  event: MessageEvent,
  c: MessageContext,
  t: Translate = english,
): string | null {
  const first = c.customerName?.trim().split(/\s+/)[0];
  const greet = first ? t("Hi {name}, ", { name: first }) : "";
  const vars = { shop: c.shopName, number: c.orderNumber };
  switch (event) {
    case "confirmed":
      return (
        greet +
        t("your {shop} order {number} ({total}) is confirmed. Details: {url}", {
          ...vars,
          total: c.total,
          url: c.orderUrl,
        })
      );
    case "shipped":
      return (
        greet +
        t("your {shop} order {number} is on its way. Track it: {url}", {
          ...vars,
          url: c.trackingUrl ?? c.orderUrl,
        })
      );
    case "out_for_delivery":
      // Without the code, this update is only useful by email.
      if (!c.otp) return null;
      return (
        greet +
        t(
          "your {shop} order {number} arrives today. Delivery code: {code}. Share it with the courier only when you have your parcel.",
          { ...vars, code: c.otp },
        )
      );
    case "delivery_failed":
      return (
        greet +
        t("we couldn't deliver {shop} order {number} today. We'll try again; track it: {url}", {
          ...vars,
          url: c.trackingUrl ?? c.orderUrl,
        })
      );
    case "delivered":
      return (
        greet + t("your {shop} order {number} was delivered. Thank you for shopping with us!", vars)
      );
    case "cancelled":
      return (
        greet +
        t("your {shop} order {number} has been cancelled. Details: {url}", {
          ...vars,
          url: c.orderUrl,
        })
      );
  }
}
