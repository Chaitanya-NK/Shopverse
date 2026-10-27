import "server-only";

import { z } from "zod";

import { SHIPMENT_STATUSES, type ShipmentStatus } from "@/features/orders/schemas";
import { fromPostgrestError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/** The customer-facing steps; failed attempts still count as "out for delivery". */
export const TRACKING_STEPS: { label: string; statuses: ShipmentStatus[] }[] = [
  { label: "Packed", statuses: ["pending", "packed"] },
  { label: "Shipped", statuses: ["picked_up", "in_transit"] },
  { label: "Out for delivery", statuses: ["out_for_delivery", "failed_attempt"] },
  { label: "Delivered", statuses: ["delivered"] },
];

const status = z.enum(SHIPMENT_STATUSES);

// get_tracking() returns jsonb; validate it rather than trusting its shape.
const trackingSchema = z
  .object({
    shop: z.object({ name: z.string() }),
    order_number: z.string(),
    shipment_number: z.string().nullable(),
    status,
    carrier: z.string().nullable(),
    tracking_number: z.string().nullable(),
    estimated_delivery: z.string().nullable(),
    delivered_at: z.string().nullable(),
    destination: z.string().nullable(),
    items: z.array(z.object({ title: z.string(), quantity: z.number() })),
    events: z.array(
      z.object({
        status,
        description: z.string().nullable(),
        location: z.string().nullable(),
        occurred_at: z.string(),
      }),
    ),
  })
  .transform((t) => ({
    shopName: t.shop.name,
    orderNumber: t.order_number,
    shipmentNumber: t.shipment_number,
    status: t.status,
    carrier: t.carrier,
    trackingNumber: t.tracking_number,
    estimatedDelivery: t.estimated_delivery,
    deliveredAt: t.delivered_at,
    destination: t.destination,
    items: t.items,
    events: t.events.map((e) => ({
      status: e.status,
      description: e.description,
      location: e.location,
      occurredAt: e.occurred_at,
    })),
  }));

export type TrackingInfo = z.output<typeof trackingSchema>;

/** Public parcel lookup by its unguessable token. Returns null for unknown tokens. */
export async function getTracking(token: string): Promise<TrackingInfo | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_tracking", { p_token: token });
  if (error) throw fromPostgrestError(error);
  if (!data) return null;
  return trackingSchema.parse(data);
}
