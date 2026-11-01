export const SOURCE_LABELS = {
  server: "Server",
  client: "Browser",
  job: "Background job",
  action: "Action",
} as const;

export const JOB_LABELS: Record<string, string> = {
  "order.email": "Order email",
  "order.message": "WhatsApp/SMS update",
  "shipment.notify": "Shipment update",
  "return.notify": "Return update",
  "business.email": "Billing email",
  "stock.alerts": "Low-stock alerts",
  "stripe.event": "Stripe payment event",
  "platform.event": "Stripe plan event",
};

export const timeFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});
