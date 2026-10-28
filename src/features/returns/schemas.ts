import { z } from "zod";

import { slugSchema } from "@/features/organizations/schemas";
import { productImageSchema } from "@/features/products/images";
import { Constants } from "@/types/database.types";

export const RETURN_STATUSES = Constants.public.Enums.return_status;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  requested: "Requested",
  approved: "Approved",
  picked_up: "Picked up",
  received: "Received",
  completed: "Completed",
  rejected: "Declined",
  cancelled: "Withdrawn",
};

/** Reasons a shopper can choose ("undelivered" is set for parcels returned to origin). */
export const RETURN_REASONS = [
  "size_fit",
  "damaged",
  "wrong_item",
  "not_as_described",
  "changed_mind",
  "other",
] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number] | "undelivered";

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  size_fit: "Doesn't fit",
  damaged: "Arrived damaged or defective",
  wrong_item: "Wrong item sent",
  not_as_described: "Not as described",
  changed_mind: "Changed my mind",
  other: "Something else",
  undelivered: "Not delivered (returned to origin)",
};

export const RESOLUTIONS = ["refund", "exchange"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export const REFUND_STATUS_LABELS = {
  due: "Refund due",
  processing: "Refunding",
  refunded: "Refunded",
  failed: "Refund failed",
  not_needed: "Nothing to refund",
} as const;
export type RefundStatus = keyof typeof REFUND_STATUS_LABELS;

export const MANUAL_REFUND_METHODS = ["upi", "bank", "cash"] as const;
export const REFUND_METHOD_LABELS = {
  original: "Original payment",
  upi: "UPI",
  bank: "Bank transfer",
  cash: "Cash",
} as const;
export type RefundMethod = keyof typeof REFUND_METHOD_LABELS;

/** Steps a shopper sees for a return that is going ahead. */
export const RETURN_STEPS: { status: ReturnStatus; label: string }[] = [
  { status: "requested", label: "Requested" },
  { status: "approved", label: "Approved" },
  { status: "picked_up", label: "Picked up" },
  { status: "received", label: "Received" },
  { status: "completed", label: "Done" },
];

/** Open = still needs someone to act. */
export const OPEN_RETURN_STATUSES: ReturnStatus[] = [
  "requested",
  "approved",
  "picked_up",
  "received",
];

export const UPI_PATTERN = /^[A-Za-z0-9._-]{2,255}@[A-Za-z]{2,64}$/;

const money = z.coerce.number();
// Same rule as the storefront's (kept here so the storefront can import this file).
const shopSlugSchema = z.string().regex(/^[a-z0-9-]{3,48}$/);

// ---------------------------------------------------------------------------
// What can be returned (private.return_options)
// ---------------------------------------------------------------------------

export const RETURN_BLOCK_LABELS = {
  cancelled: "The order was cancelled",
  not_delivered: "Not delivered yet",
  already_returned: "Already being returned",
  not_returnable: "This item can't be returned",
  returns_off: "This shop doesn't accept returns",
  window_closed: "The return window has closed",
} as const;
type ReturnBlock = keyof typeof RETURN_BLOCK_LABELS;

export const returnOptionsSchema = z
  .object({
    window_days: z.number().int(),
    allow_exchanges: z.boolean(),
    needs_upi: z.boolean(),
    order_number: z.string().optional(),
    items: z.array(
      z.object({
        order_item_id: z.uuid(),
        title: z.string(),
        sku: z.string(),
        quantity: z.number().int(),
        unit_price: money,
        unit_paid: money,
        image: productImageSchema,
        delivered: z.number().int(),
        returnable: z.number().int(),
        window_ends_at: z.string().nullable(),
        blocked: z
          .enum(Object.keys(RETURN_BLOCK_LABELS) as [ReturnBlock, ...ReturnBlock[]])
          .nullable(),
        exchange_for: z.array(
          z.object({ variant_id: z.uuid(), title: z.string(), available: z.number().int() }),
        ),
      }),
    ),
  })
  .transform((o) => ({
    windowDays: o.window_days,
    allowExchanges: o.allow_exchanges,
    needsUpi: o.needs_upi,
    orderNumber: o.order_number ?? null,
    items: o.items.map((i) => ({
      orderItemId: i.order_item_id,
      title: i.title,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: i.unit_price,
      unitPaid: i.unit_paid,
      image: i.image,
      delivered: i.delivered,
      returnable: i.returnable,
      windowEndsAt: i.window_ends_at,
      blocked: i.blocked,
      exchangeFor: i.exchange_for.map((e) => ({
        variantId: e.variant_id,
        title: e.title,
        available: e.available,
      })),
    })),
  }));
export type ReturnOptions = z.output<typeof returnOptionsSchema>;
export type ReturnOptionItem = ReturnOptions["items"][number];

// ---------------------------------------------------------------------------
// Returns on the shopper's order page (storefront_order.returns)
// ---------------------------------------------------------------------------

export const orderReturnSchema = z.object({
  id: z.uuid(),
  number: z.string(),
  status: z.enum(RETURN_STATUSES),
  source: z.enum(["customer", "staff", "rto"]),
  resolution: z.enum(RESOLUTIONS),
  reason: z.string(),
  staff_note: z.string().nullable(),
  created_at: z.string(),
  credit_total: money,
  refund_amount: money,
  refunded_amount: money,
  refund_status: z.enum(["due", "processing", "refunded", "failed", "not_needed"]).nullable(),
  refund_method: z.enum(["original", "upi", "bank", "cash"]).nullable(),
  credit_note_number: z.string().nullable(),
  exchange_order_token: z.string().nullable(),
  items: z
    .array(
      z.object({ title: z.string(), quantity: z.number(), exchange_for: z.string().nullable() }),
    )
    .nullable()
    .transform((v) => v ?? []),
});
export type OrderReturn = z.output<typeof orderReturnSchema>;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const returnLineSchema = z.object({
  orderItemId: z.uuid(),
  quantity: z.coerce.number().int().min(0).max(10_000),
  exchangeVariantId: z.uuid().nullable().optional().default(null),
});

const returnFormFields = {
  lines: z
    .array(returnLineSchema)
    .max(100)
    .refine((lines) => lines.some((l) => l.quantity > 0), "Choose at least one item"),
  reason: z.enum(RETURN_REASONS, { error: "Choose a reason" }),
  note: z.string().trim().max(1000, "Keep it under 1,000 characters").optional().default(""),
  resolution: z.enum(RESOLUTIONS),
  refundUpi: z
    .string()
    .trim()
    .refine((v) => v === "" || UPI_PATTERN.test(v), "Enter a UPI id like name@bank")
    .optional()
    .default(""),
};

/** Shared checks: at least one item, an option for exchanges, a note for "other". */
function refineReturnForm(
  v: {
    lines: z.output<typeof returnLineSchema>[];
    reason: string;
    note: string;
    resolution: Resolution;
  },
  ctx: z.RefinementCtx,
) {
  if (v.resolution === "exchange")
    v.lines.forEach((l, i) => {
      if (l.quantity > 0 && !l.exchangeVariantId)
        ctx.addIssue({
          code: "custom",
          path: ["lines", i, "exchangeVariantId"],
          message: "Choose what to exchange it for",
        });
    });
  if (v.reason === "other" && !v.note)
    ctx.addIssue({ code: "custom", path: ["note"], message: "Tell the shop what went wrong" });
}

/** The form shoppers and staff fill in (ids are added when it's sent). */
export const returnFormSchema = z
  .object({ needsUpi: z.boolean().optional().default(false), ...returnFormFields })
  .superRefine((v, ctx) => {
    refineReturnForm(v, ctx);
    if (v.needsUpi && v.resolution === "refund" && !v.refundUpi)
      ctx.addIssue({
        code: "custom",
        path: ["refundUpi"],
        message: "Enter the UPI id to refund to",
      });
  });
export type ReturnFormInput = z.input<typeof returnFormSchema>;
export type ReturnFormOutput = z.output<typeof returnFormSchema>;

export const requestReturnSchema = z
  .object({
    shopSlug: shopSlugSchema,
    orderToken: z.string().regex(/^[0-9a-f]{32}$/),
    needsUpi: z.boolean().optional().default(false),
    ...returnFormFields,
  })
  .superRefine((v, ctx) => {
    refineReturnForm(v, ctx);
    if (v.needsUpi && v.resolution === "refund" && !v.refundUpi)
      ctx.addIssue({
        code: "custom",
        path: ["refundUpi"],
        message: "Enter the UPI id to refund to",
      });
  });
export type RequestReturnInput = z.input<typeof requestReturnSchema>;

export const staffReturnSchema = z
  .object({
    organizationSlug: slugSchema,
    orderId: z.uuid(),
    ...returnFormFields,
  })
  .superRefine(refineReturnForm);
export type StaffReturnInput = z.input<typeof staffReturnSchema>;

/** Lines to send to the database: chosen items only. */
export function toReturnItemsJson(
  lines: z.output<typeof returnLineSchema>[],
  resolution: Resolution,
) {
  return lines
    .filter((l) => l.quantity > 0)
    .map((l) => ({
      order_item_id: l.orderItemId,
      quantity: l.quantity,
      ...(resolution === "exchange" && l.exchangeVariantId
        ? { exchange_variant_id: l.exchangeVariantId }
        : {}),
    }));
}

export const cancelReturnSchema = z.object({
  shopSlug: shopSlugSchema,
  orderToken: z.string().regex(/^[0-9a-f]{32}$/),
  returnId: z.uuid(),
});

const staffReturnRef = { organizationSlug: slugSchema, returnId: z.uuid() };
export const returnRefSchema = z.object(staffReturnRef);

export const reviewReturnSchema = z
  .object({
    ...staffReturnRef,
    approve: z.boolean(),
    note: z.string().trim().max(500, "Keep it under 500 characters").optional().default(""),
  })
  .superRefine((v, ctx) => {
    if (!v.approve && !v.note)
      ctx.addIssue({ code: "custom", path: ["note"], message: "Tell the customer why" });
  });
export type ReviewReturnInput = z.input<typeof reviewReturnSchema>;

export const receiveReturnSchema = z.object({
  ...staffReturnRef,
  items: z
    .array(
      z.object({
        returnItemId: z.uuid(),
        restock: z.boolean(),
        serialNumbers: z.array(z.string().trim().min(1).max(100)).max(1000).optional().default([]),
      }),
    )
    .max(100),
});
export type ReceiveReturnInput = z.input<typeof receiveReturnSchema>;

export const manualRefundSchema = z
  .object({
    ...staffReturnRef,
    method: z.enum(MANUAL_REFUND_METHODS),
    reference: z.string().trim().max(120, "Keep it under 120 characters").optional().default(""),
  })
  .superRefine((v, ctx) => {
    if (v.method !== "cash" && !v.reference)
      ctx.addIssue({
        code: "custom",
        path: ["reference"],
        message: v.method === "upi" ? "Enter the UPI transaction id" : "Enter the bank reference",
      });
  });
export type ManualRefundInput = z.input<typeof manualRefundSchema>;
