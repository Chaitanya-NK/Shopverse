import "server-only";

import { notifyShipment } from "@/features/notifications/order-notifier";
import { fromPostgrestError } from "@/lib/errors";
import { type TrackingUpdate } from "@/lib/couriers/types";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Apply a courier's tracking update (from its webhook, or the test courier's
 * simulator) and tell the customer about the steps that matter to them.
 */
export async function applyCourierUpdate(courier: string, awb: string, update: TrackingUpdate) {
  const { data, error } = await createAdminClient().rpc("courier_shipment_update", {
    p_courier: courier,
    p_awb: awb,
    p_status: update.status,
    p_event_id: update.eventId,
    p_description: update.description,
    p_location: update.location ?? undefined,
    p_occurred_at: update.occurredAt.toISOString(),
  });
  if (error) throw fromPostgrestError(error);
  const result = data as { applied: boolean; shipment_id?: string; status?: string };
  if (result.applied && result.shipment_id) {
    if (update.status === "picked_up") notifyShipment(result.shipment_id, "shipped");
    else if (update.status === "failed_attempt")
      notifyShipment(result.shipment_id, "delivery_failed");
    else if (update.status === "delivered") notifyShipment(result.shipment_id, "delivered");
  }
  return result;
}
