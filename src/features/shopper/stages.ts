/** Where an order is, in the customer's words (private.order_stage). */
export const ORDER_STAGES = [
  "placed",
  "confirmed",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "returned",
  "cancelled",
] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

export const ORDER_STAGE_LABELS: Record<OrderStage, string> = {
  placed: "Placed",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "On the way",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  returned: "Returned",
  cancelled: "Cancelled",
};
