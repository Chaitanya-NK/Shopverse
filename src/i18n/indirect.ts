/**
 * Text that reaches shoppers through lookups rather than a literal t("…")
 * call (status labels, default section headings…). Listed here so the
 * dictionary test can check each has a translation.
 */
import { ORDER_STAGE_LABELS } from "@/features/shopper/stages";
import { SHIPMENT_STATUS_LABELS } from "@/features/orders/schemas";
import { TRACKING_STEPS } from "@/features/orders/tracking";
import {
  REFUND_METHOD_LABELS,
  RETURN_BLOCK_LABELS,
  RETURN_REASON_LABELS,
  RETURN_STATUS_LABELS,
} from "@/features/returns/schemas";
import { CATALOG_SORTS } from "@/features/storefront/schemas";
import { STOREFRONT_POLICIES } from "@/features/storefront/policies";

export const INDIRECT_TEXT: string[] = [
  ...Object.values(ORDER_STAGE_LABELS),
  ...Object.values(SHIPMENT_STATUS_LABELS),
  ...TRACKING_STEPS.map((s) => s.label),
  ...Object.values(REFUND_METHOD_LABELS),
  ...Object.values(RETURN_BLOCK_LABELS),
  ...Object.values(RETURN_REASON_LABELS),
  ...Object.values(RETURN_STATUS_LABELS),
  ...Object.values(CATALOG_SORTS),
  ...Object.values(STOREFRONT_POLICIES),
  // Order page headlines.
  "Complete your payment",
  "Order received",
  "Order confirmed",
  "Packed and ready to ship",
  "On its way",
  "Out for delivery today",
  "Delivered",
  "Returned to the shop",
  "Order cancelled",
  // Refund wording on the order page.
  "to your original payment method",
  "by UPI",
  "to your bank account",
  "in cash",
  // Review stars.
  "Poor",
  "Fair",
  "Good",
  "Very good",
  "Excellent",
  // Countdown units.
  "days",
  "hours",
  "minutes",
  "seconds",
  // Address and contact form labels (passed through a helper).
  "Full name",
  "Email",
  "Mobile number",
  "House, street, area",
  "Landmark (optional)",
  "City",
  "PIN code",
  // Footer small print (the default design's).
  "Cash on delivery across India.",
  // Pagination nouns.
  "products",
  "orders",
  "results",
];
