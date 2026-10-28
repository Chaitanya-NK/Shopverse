import { z } from "zod";

import { slugSchema } from "@/features/organizations/schemas";
import { Constants, type Enums } from "@/types/database.types";

export type OrderStatus = Enums<"order_status">;
export type PaymentStatus = Enums<"payment_status">;
export type PaymentMethod = Enums<"payment_method">;
export type FulfillmentStatus = Enums<"fulfillment_status">;
export type ShipmentStatus = Enums<"shipment_status">;

export const ORDER_STATUSES = Constants.public.Enums.order_status;
export const PAYMENT_STATUSES = Constants.public.Enums.payment_status;
export const PAYMENT_METHODS = Constants.public.Enums.payment_method;
/** Methods staff record on orders they enter ("online" is only for storefront checkout). */
export const STAFF_PAYMENT_METHODS = PAYMENT_METHODS.filter(
  (m): m is Exclude<PaymentMethod, "online"> => m !== "online",
);
export const FULFILLMENT_STATUSES = Constants.public.Enums.fulfillment_status;
export const SHIPMENT_STATUSES = Constants.public.Enums.shipment_status;

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Unpaid",
  authorized: "Authorised",
  paid: "Paid",
  partially_refunded: "Part refunded",
  refunded: "Refunded",
  failed: "Failed",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  upi: "UPI",
  card: "Card",
  netbanking: "Net banking",
  wallet: "Wallet",
  cod: "Cash on delivery",
  store_credit: "Store credit",
  online: "Online payment",
};

export const FULFILLMENT_LABELS: Record<FulfillmentStatus, string> = {
  unfulfilled: "Unfulfilled",
  partially_fulfilled: "Partly shipped",
  fulfilled: "Shipped",
  returned: "Returned",
};

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  pending: "Pending",
  packed: "Packed",
  picked_up: "Picked up",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  failed_attempt: "Delivery failed",
  returned_to_origin: "Returned",
  cancelled: "Cancelled",
};

/**
 * Text for a tracking event. The database fills in "Out For Delivery"-style
 * text when no note was given; show our wording for those instead.
 */
export function shipmentEventText(status: ShipmentStatus, description: string | null): string {
  const generated = status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return !description || description === generated ? SHIPMENT_STATUS_LABELS[status] : description;
}

/** Where a shipment can go next (mirrors update_shipment_status in the database). */
export const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  pending: [],
  packed: ["picked_up", "cancelled"],
  picked_up: ["in_transit", "out_for_delivery", "returned_to_origin"],
  in_transit: ["out_for_delivery", "returned_to_origin"],
  out_for_delivery: ["failed_attempt", "returned_to_origin"],
  failed_attempt: ["out_for_delivery", "returned_to_origin"],
  delivered: [],
  returned_to_origin: [],
  cancelled: [],
};

export const ACTIVE_SHIPMENT_STATUSES: ShipmentStatus[] = [
  "packed",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "failed_attempt",
];

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const MAX_MONEY = 9_999_999_999.99;

/** "₹ 1,299.50" or 1299.5 -> 1299.5; blank -> 0. */
export const moneySchema = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const raw = typeof v === "string" ? v.replace(/[,\s₹]/g, "") : v;
  if (raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > MAX_MONEY) {
    ctx.addIssue({ code: "custom", message: "Enter an amount of 0 or more" });
    return z.NEVER;
  }
  return Math.round(n * 100) / 100;
});

/** Indian or international phone, spaces and dashes allowed: "+91 98000 00001". */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .pipe(z.string().regex(/^\+?[0-9]{8,15}$/, "Enter a valid phone number"));

const optionalPhone = z
  .string()
  .trim()
  .optional()
  .transform((v) => v?.replace(/[\s()-]/g, "") || undefined)
  .pipe(
    z
      .string()
      .regex(/^\+?[0-9]{8,15}$/, "Enter a valid phone number")
      .optional(),
  );

export const addressSchema = z.object({
  name: z.string().trim().min(2, "Enter the recipient's name").max(120),
  phone: phoneSchema,
  line1: z.string().trim().min(3, "Enter the street address").max(200),
  line2: z.string().trim().max(200).optional().default(""),
  city: z.string().trim().min(2, "Enter the city").max(80),
  state: z.string().trim().min(2, "Enter the state").max(80),
  postalCode: z
    .string()
    .trim()
    .regex(/^[1-9][0-9]{5}$/, "Enter a 6-digit PIN code"),
});

export type AddressInput = z.input<typeof addressSchema>;

export const orderLineSchema = z.object({
  variantId: z.uuid(),
  quantity: z.coerce
    .number({ error: "Enter a quantity" })
    .int("Use whole units")
    .min(1, "At least 1")
    .max(10_000, "At most 10,000"),
  unitPrice: moneySchema,
});

export const createOrderSchema = z
  .object({
    organizationSlug: slugSchema,
    shopId: z.uuid({ error: "Choose a shop" }),
    customer: z.object({
      fullName: z.string().trim().max(120).optional().default(""),
      email: z
        .union([z.literal(""), z.email("Enter a valid email")])
        .optional()
        .default(""),
      phone: optionalPhone,
    }),
    address: addressSchema,
    lines: z
      .array(orderLineSchema)
      .min(1, "Add at least one product")
      .max(100, "An order can have at most 100 lines")
      .refine((lines) => new Set(lines.map((l) => l.variantId)).size === lines.length, {
        message: "Each product can be added once; change its quantity instead",
      }),
    paymentMethod: z.enum(STAFF_PAYMENT_METHODS),
    paid: z.boolean(),
    shippingTotal: moneySchema,
    discountTotal: moneySchema,
    notes: z.string().trim().max(1000, "Keep notes under 1,000 characters").optional().default(""),
    confirm: z.boolean(),
  })
  .superRefine((order, ctx) => {
    const subtotal = order.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
    if (order.discountTotal > subtotal) {
      ctx.addIssue({
        code: "custom",
        path: ["discountTotal"],
        message: "Discount can't exceed the subtotal",
      });
    }
    if (order.paid && order.paymentMethod === "cod") {
      ctx.addIssue({
        code: "custom",
        path: ["paid"],
        message: "Cash on delivery is collected at the door",
      });
    }
  });

export type CreateOrderInput = z.input<typeof createOrderSchema>;

const orderRef = { organizationSlug: slugSchema, orderId: z.uuid() };

export const orderActionSchema = z.object(orderRef);

export const cancelOrderSchema = z.object({
  ...orderRef,
  reason: z.string().trim().max(500, "Keep the reason under 500 characters").optional().default(""),
});

export const updateOrderNotesSchema = z.object({
  ...orderRef,
  notes: z.string().trim().max(1000, "Keep notes under 1,000 characters"),
});

export const createShipmentSchema = z.object({
  ...orderRef,
  warehouseId: z.uuid(),
  items: z
    .array(
      z.object({
        orderItemId: z.uuid(),
        quantity: z.coerce.number().int("Use whole units").min(0).max(10_000),
        serials: z.array(z.string().trim().min(1)).max(500).default([]),
      }),
    )
    .refine((items) => items.some((i) => i.quantity > 0), {
      message: "Choose at least one item to ship",
    }),
  carrier: z.string().trim().max(60).optional().default(""),
  trackingNumber: z
    .string()
    .trim()
    .max(60)
    .regex(/^[A-Za-z0-9-]*$/, "Letters, numbers and dashes only")
    .optional()
    .default(""),
  estimatedDelivery: z
    .union([z.literal(""), z.iso.date()])
    .optional()
    .default(""),
});

export const updateShipmentStatusSchema = z.object({
  organizationSlug: slugSchema,
  shipmentId: z.uuid(),
  status: z.enum([
    "picked_up",
    "in_transit",
    "out_for_delivery",
    "failed_attempt",
    "returned_to_origin",
    "cancelled",
  ]),
  description: z.string().trim().max(300).optional().default(""),
  location: z.string().trim().max(120).optional().default(""),
});

export const confirmDeliverySchema = z.object({
  organizationSlug: slugSchema,
  shipmentId: z.uuid(),
  otp: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, "Enter the 6-digit code"),
});

export const sellableSearchSchema = z.object({
  organizationSlug: slugSchema,
  shopId: z.uuid(),
  query: z.string().trim().max(100),
});
