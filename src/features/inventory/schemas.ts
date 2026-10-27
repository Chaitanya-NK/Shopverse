import { z } from "zod";

import { slugSchema } from "@/features/organizations/schemas";
import { type Enums } from "@/types/database.types";

export type Tracking = Enums<"inventory_tracking">;
export type MovementType = Enums<"stock_movement_type">;

export const RECEIVE_TYPES = ["receipt", "return", "adjustment"] as const;
export const REMOVE_TYPES = ["sale", "damage", "adjustment"] as const;

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  receipt: "Received",
  adjustment: "Adjustment",
  sale: "Sold",
  return: "Customer return",
  transfer_out: "Transferred out",
  transfer_in: "Transferred in",
  damage: "Damaged",
};

export const RECEIVE_TYPE_LABELS: Record<(typeof RECEIVE_TYPES)[number], string> = {
  receipt: "New stock received",
  return: "Customer return",
  adjustment: "Count correction",
};

export const REMOVE_TYPE_LABELS: Record<(typeof REMOVE_TYPES)[number], string> = {
  sale: "Sold offline",
  damage: "Damaged or expired",
  adjustment: "Count correction",
};

export const MAX_QUANTITY = 100_000;
export const MAX_SERIALS = 500;

/** Mirrors inventory_serials.serial_number. */
export const SERIAL_PATTERN = /^[A-Za-z0-9._/-]{3,64}$/;
/** Mirrors inventory_batches.batch_code. */
export const BATCH_PATTERN = /^[A-Za-z0-9._/-]{1,40}$/;

/**
 * Split scanned or pasted serials (newlines, commas, spaces or tabs),
 * upper-case them and drop duplicates, keeping the first-seen order.
 */
export function parseSerials(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const serial = raw.trim().toUpperCase();
    if (serial && !seen.has(serial)) {
      seen.add(serial);
      result.push(serial);
    }
  }
  return result;
}

const quantity = z.coerce
  .number({ error: "Enter a quantity" })
  .int("Use whole units")
  .min(1, "At least 1")
  .max(MAX_QUANTITY, `At most ${MAX_QUANTITY.toLocaleString("en-IN")}`);

const serials = z
  .array(z.string().regex(SERIAL_PATTERN, "Serials are 3–64 letters, numbers or . _ / -"))
  .min(1, "Add at least one serial number")
  .max(MAX_SERIALS, `At most ${MAX_SERIALS} serials at a time`);

const note = z
  .string()
  .trim()
  .max(500, "Keep the note under 500 characters")
  .optional()
  .transform((v) => v || null);

const base = {
  organizationSlug: slugSchema,
  variantId: z.uuid({ error: "Choose a product" }),
  note,
};

export const receiveStockSchema = z.discriminatedUnion("tracking", [
  z.object({
    ...base,
    tracking: z.literal("quantity"),
    warehouseId: z.uuid({ error: "Choose a warehouse" }),
    type: z.enum(RECEIVE_TYPES),
    quantity,
  }),
  z.object({
    ...base,
    tracking: z.literal("serial"),
    warehouseId: z.uuid({ error: "Choose a warehouse" }),
    type: z.enum(RECEIVE_TYPES),
    serials,
  }),
  z.object({
    ...base,
    tracking: z.literal("batch"),
    warehouseId: z.uuid({ error: "Choose a warehouse" }),
    type: z.enum(RECEIVE_TYPES),
    quantity,
    batchCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(BATCH_PATTERN, "Batch codes are 1–40 letters, numbers or . _ / -"),
    expiryDate: z.iso.date({ error: "Enter a valid date" }).nullish(),
  }),
]);

const batchId = z.uuid({ error: "Choose a batch" });

export const removeStockSchema = z.discriminatedUnion("tracking", [
  z.object({
    ...base,
    tracking: z.literal("quantity"),
    warehouseId: z.uuid(),
    type: z.enum(REMOVE_TYPES),
    quantity,
  }),
  z.object({
    ...base,
    tracking: z.literal("serial"),
    warehouseId: z.uuid(),
    type: z.enum(REMOVE_TYPES),
    serials,
  }),
  z.object({
    ...base,
    tracking: z.literal("batch"),
    warehouseId: z.uuid(),
    type: z.enum(REMOVE_TYPES),
    quantity,
    batchId,
  }),
]);

const transferBase = {
  ...base,
  fromWarehouseId: z.uuid(),
  toWarehouseId: z.uuid({ error: "Choose where to send it" }),
};

export const transferStockSchema = z
  .discriminatedUnion("tracking", [
    z.object({ ...transferBase, tracking: z.literal("quantity"), quantity }),
    z.object({ ...transferBase, tracking: z.literal("serial"), serials }),
    z.object({ ...transferBase, tracking: z.literal("batch"), quantity, batchId }),
  ])
  .refine((v) => v.fromWarehouseId !== v.toWarehouseId, {
    path: ["toWarehouseId"],
    message: "Choose a different warehouse",
  });

export const setReorderPointSchema = z.object({
  organizationSlug: slugSchema,
  variantId: z.uuid(),
  warehouseId: z.uuid(),
  reorderPoint: z.coerce
    .number()
    .int("Use whole units")
    .min(0, "Can't be negative")
    .max(MAX_QUANTITY),
});

export const stockLocationSchema = z.object({
  organizationSlug: slugSchema,
  variantId: z.uuid(),
  warehouseId: z.uuid(),
});

export const variantSearchSchema = z.object({
  organizationSlug: slugSchema,
  query: z.string().trim().max(100),
});

export const movementHistorySchema = z.object({
  organizationSlug: slugSchema,
  variantId: z.uuid(),
  warehouseId: z.uuid().optional(),
});
