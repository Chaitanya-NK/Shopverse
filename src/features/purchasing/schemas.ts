import { z } from "zod";

import { slugSchema } from "@/features/organizations/schemas";
import { Constants } from "@/types/database.types";

export const PO_STATUSES = Constants.public.Enums.purchase_order_status;
export type PurchaseOrderStatus = (typeof PO_STATUSES)[number];

export const PO_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: "Draft",
  ordered: "Ordered",
  partially_received: "Partly received",
  received: "Received",
  closed: "Closed",
  cancelled: "Cancelled",
};

/** Tabs on the purchase orders page. */
export const PO_VIEWS = {
  open: { label: "Open", statuses: ["draft", "ordered", "partially_received"] },
  received: { label: "Received", statuses: ["received", "closed"] },
  cancelled: { label: "Cancelled", statuses: ["cancelled"] },
} as const satisfies Record<string, { label: string; statuses: readonly PurchaseOrderStatus[] }>;
export type PoView = keyof typeof PO_VIEWS;
export const PO_VIEW_IDS = Object.keys(PO_VIEWS) as PoView[];

const optional = (max: number, label = "This") =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long`)
    .optional()
    .default("")
    .transform((v) => v || null);

export const supplierFormSchema = z.object({
  organizationSlug: slugSchema,
  supplierId: z.uuid().optional(),
  name: z.string().trim().min(2, "Enter the supplier's name").max(120, "Name is too long"),
  contactName: optional(120, "Name"),
  email: z
    .union([z.literal(""), z.email("Enter a valid email")])
    .optional()
    .default("")
    .transform((v) => v || null),
  phone: z
    .string()
    .trim()
    .regex(/^([0-9+ ()-]{6,20})?$/, "Enter a valid phone number")
    .optional()
    .default("")
    .transform((v) => v || null),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])?$/,
      "Enter a valid 15-character GSTIN",
    )
    .optional()
    .default("")
    .transform((v) => v || null),
  line1: optional(160, "Address"),
  city: optional(80, "City"),
  state: optional(80, "State"),
  postalCode: optional(12, "PIN code"),
  paymentTerms: optional(120, "Payment terms"),
  leadTimeDays: z
    .union([z.literal(""), z.coerce.number().int().min(0, "0–365 days").max(365, "0–365 days")])
    .optional()
    .default("")
    .transform((v) => (v === "" ? null : v)),
  notes: optional(1000, "Notes"),
  isActive: z.boolean().optional().default(true),
});
export type SupplierFormInput = z.input<typeof supplierFormSchema>;

export const purchaseOrderLineSchema = z.object({
  variantId: z.uuid(),
  quantity: z.coerce
    .number({ error: "Enter a quantity" })
    .int("Whole units only")
    .min(1, "At least 1")
    .max(100000, "Too many"),
  unitCost: z.coerce
    .number({ error: "Enter a cost" })
    .min(0, "Can't be negative")
    .max(9_999_999, "Too large"),
  taxRate: z.coerce.number().min(0).max(100).optional().default(0),
});

export const purchaseOrderFormSchema = z.object({
  organizationSlug: slugSchema,
  purchaseOrderId: z.uuid().optional(),
  supplierId: z.uuid({ error: "Choose a supplier" }),
  warehouseId: z.uuid({ error: "Choose where it's delivered" }),
  expectedAt: z
    .string()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/)
    .optional()
    .default("")
    .transform((v) => v || null),
  supplierReference: optional(60, "Reference"),
  notes: optional(2000, "Notes"),
  lines: z
    .array(purchaseOrderLineSchema)
    .min(1, "Add at least one product")
    .max(200, "At most 200 lines")
    .refine(
      (lines) => new Set(lines.map((l) => l.variantId)).size === lines.length,
      "Each product once",
    ),
});
export type PurchaseOrderFormInput = z.input<typeof purchaseOrderFormSchema>;

export const purchaseOrderRefSchema = z.object({
  organizationSlug: slugSchema,
  purchaseOrderId: z.uuid(),
});

export const placePurchaseOrderSchema = purchaseOrderRefSchema.extend({
  emailSupplier: z.boolean().optional().default(false),
});

export const receiveLineSchema = z.object({
  itemId: z.uuid(),
  quantity: z.coerce.number().int().min(0).max(100000).optional().default(0),
  serials: z.array(z.string().trim().max(64)).max(500).optional().default([]),
  batchCode: z.string().trim().max(40).optional().default(""),
  expiryDate: z
    .string()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/)
    .optional()
    .default(""),
});

export const receivePurchaseOrderSchema = purchaseOrderRefSchema.extend({
  lines: z.array(receiveLineSchema).min(1).max(200),
});

/** Totals as the database computes them (each line rounded to paise). */
export function purchaseOrderTotals(
  lines: { quantity: number; unitCost: number; taxRate: number }[],
) {
  const r = (n: number) => Math.round(n * 100) / 100;
  const subtotal = lines.reduce((s, l) => s + r(l.quantity * l.unitCost), 0);
  const tax = lines.reduce((s, l) => s + r((l.quantity * l.unitCost * l.taxRate) / 100), 0);
  return { subtotal: r(subtotal), tax: r(tax), total: r(subtotal + tax) };
}

/** Serial numbers typed or scanned one per line (or separated by commas). */
export function parseSerials(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
