import "server-only";

import {
  handlePlatformEvent,
  type PlatformEvent,
  runBusinessEmailJob,
} from "@/features/billing/server";
import { runOrderMessageJob } from "@/features/messaging/server";
import {
  runOrderEmailJob,
  runReturnJob,
  runShipmentJob,
} from "@/features/notifications/order-notifier";
import { sendStockAlerts } from "@/features/operations/server";
import { runStripeEventJob } from "@/features/payments/server";
import { type JobHandler } from "@/lib/jobs/worker";

/** Every kind of background job and the code that runs it. */
export const HANDLERS: Record<string, JobHandler> = {
  "order.email": runOrderEmailJob,
  "order.message": runOrderMessageJob,
  "shipment.notify": runShipmentJob,
  "return.notify": runReturnJob,
  "business.email": runBusinessEmailJob,
  "stock.alerts": async () => {
    await sendStockAlerts();
  },
  "stripe.event": runStripeEventJob,
  "platform.event": async (payload) => {
    await handlePlatformEvent(payload.event as PlatformEvent);
  },
};
