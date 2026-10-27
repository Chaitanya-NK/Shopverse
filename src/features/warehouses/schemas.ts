import { z } from "zod";

import { slugSchema } from "@/features/organizations/schemas";

/** Mirrors the `warehouses.code` check constraint: 2–12 of A–Z, 0–9 and "-". */
export const warehouseCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{2,12}$/, "Use 2–12 letters, numbers or dashes, e.g. BLR-1");

const optionalText = (max: number) =>
  z.string().trim().max(max, `Keep this under ${max} characters`).optional().default("");

export const warehouseAddressSchema = z.object({
  line1: optionalText(160),
  city: optionalText(80),
  state: optionalText(80),
  postalCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9 -]{0,12}$/, "Enter a valid postal code")
    .optional()
    .default(""),
});

export type WarehouseAddress = z.output<typeof warehouseAddressSchema>;

const warehouseFields = {
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80, "Name is too long"),
  code: warehouseCodeSchema,
  address: warehouseAddressSchema,
  isActive: z.boolean(),
  /** Shops this warehouse fulfils orders for. */
  shopIds: z.array(z.uuid()).max(100),
};

export const warehouseFormSchema = z.object(warehouseFields);
export type WarehouseFormInput = z.input<typeof warehouseFormSchema>;

export const createWarehouseSchema = z.object({
  organizationSlug: slugSchema,
  ...warehouseFields,
});

export const updateWarehouseSchema = z.object({
  organizationSlug: slugSchema,
  warehouseId: z.uuid(),
  ...warehouseFields,
});

/** Parse the free-form `address` jsonb column into the shape the UI edits. */
export function parseWarehouseAddress(value: unknown): WarehouseAddress {
  const parsed = warehouseAddressSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : { line1: "", city: "", state: "", postalCode: "" };
}

export function formatWarehouseLocation(address: WarehouseAddress): string {
  return [address.city, address.state].filter(Boolean).join(", ");
}
