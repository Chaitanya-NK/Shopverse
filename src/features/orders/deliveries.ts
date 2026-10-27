import { type ShipmentStatus } from "@/features/orders/schemas";

/** Tabs on the deliveries board and the shipment statuses each one shows. */
export const DELIVERY_VIEWS = {
  pickup: { label: "To hand over", statuses: ["packed"] },
  transit: { label: "In transit", statuses: ["picked_up", "in_transit"] },
  out: { label: "Out for delivery", statuses: ["out_for_delivery", "failed_attempt"] },
  delivered: { label: "Delivered", statuses: ["delivered"] },
  closed: { label: "Returned & cancelled", statuses: ["returned_to_origin", "cancelled"] },
} as const satisfies Record<string, { label: string; statuses: readonly ShipmentStatus[] }>;

export type DeliveryView = keyof typeof DELIVERY_VIEWS;
export const DELIVERY_VIEW_IDS = Object.keys(DELIVERY_VIEWS) as DeliveryView[];
