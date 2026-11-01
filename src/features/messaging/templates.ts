/** Order updates by WhatsApp or SMS: short, plain text, one link. */

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

const hi = (name: string | null) => {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Hi ${first}, ` : "";
};

export function messageBody(event: MessageEvent, c: MessageContext): string | null {
  const greet = hi(c.customerName);
  switch (event) {
    case "confirmed":
      return `${greet}your ${c.shopName} order ${c.orderNumber} (${c.total}) is confirmed. Details: ${c.orderUrl}`;
    case "shipped":
      return `${greet}your ${c.shopName} order ${c.orderNumber} is on its way. Track it: ${c.trackingUrl ?? c.orderUrl}`;
    case "out_for_delivery":
      // Without the code, this update is only useful by email.
      if (!c.otp) return null;
      return `${greet}your ${c.shopName} order ${c.orderNumber} arrives today. Delivery code: ${c.otp}. Share it with the courier only when you have your parcel.`;
    case "delivery_failed":
      return `${greet}we couldn't deliver ${c.shopName} order ${c.orderNumber} today. We'll try again; track it: ${c.trackingUrl ?? c.orderUrl}`;
    case "delivered":
      return `${greet}your ${c.shopName} order ${c.orderNumber} was delivered. Thank you for shopping with us!`;
    case "cancelled":
      return `${greet}your ${c.shopName} order ${c.orderNumber} has been cancelled. Details: ${c.orderUrl}`;
  }
}
