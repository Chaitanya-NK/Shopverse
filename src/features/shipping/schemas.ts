import { z } from "zod";

import { slugSchema } from "@/features/organizations/schemas";

export const parcelSchema = z.object({
  weightGrams: z.coerce
    .number()
    .int("Whole grams")
    .min(10, "At least 10 g")
    .max(50_000, "Up to 50 kg"),
  lengthCm: z.coerce.number().min(1, "At least 1 cm").max(200, "Up to 200 cm"),
  breadthCm: z.coerce.number().min(1, "At least 1 cm").max(200, "Up to 200 cm"),
  heightCm: z.coerce.number().min(1, "At least 1 cm").max(200, "Up to 200 cm"),
});
export type ParcelInput = z.input<typeof parcelSchema>;

const shipmentRef = { organizationSlug: slugSchema, shipmentId: z.uuid() };

export const quoteSchema = z.object({ ...shipmentRef, parcel: parcelSchema });
export const bookSchema = z.object({
  ...shipmentRef,
  parcel: parcelSchema,
  service: z.string().regex(/^[a-z_]{2,30}$/),
});
export const shipmentRefSchema = z.object(shipmentRef);
export const simulateSchema = z.object({ ...shipmentRef, outcome: z.enum(["deliver", "fail"]) });

const addressSchema = z
  .object({
    name: z.string().catch(""),
    phone: z.string().catch(""),
    line1: z.string().catch(""),
    line2: z.string().catch(""),
    landmark: z.string().catch(""),
    city: z.string().catch(""),
    state: z.string().catch(""),
    postal_code: z.string().catch(""),
  })
  .partial()
  .catch({});

const warehouseAddressSchema = z
  .object({
    line1: z.string().catch(""),
    city: z.string().catch(""),
    state: z.string().catch(""),
    postalCode: z.string().catch(""),
  })
  .partial()
  .catch({});

export const shipmentDocumentSchema = z.object({
  shipment: z.object({
    id: z.uuid(),
    number: z.string().nullable(),
    status: z.string(),
    carrier: z.string().nullable(),
    courier: z.string().nullable(),
    service: z.string().nullable(),
    awb: z.string().nullable(),
    package: z
      .object({
        weight_grams: z.number().optional(),
        length_cm: z.number().optional(),
        breadth_cm: z.number().optional(),
        height_cm: z.number().optional(),
      })
      .nullable(),
    cod_amount: z.coerce.number().nullable(),
    created_at: z.string(),
    booked_at: z.string().nullable(),
  }),
  order: z.object({
    id: z.uuid(),
    number: z.string(),
    placed_at: z.string(),
    payment_method: z.string(),
    payment_status: z.string(),
    grand_total: z.coerce.number(),
    currency: z.string(),
    note: z.string().nullable(),
    shipping_address: addressSchema,
  }),
  shop: z.object({
    name: z.string(),
    legal_name: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    gstin: z.string().nullable(),
  }),
  warehouse: z.object({ name: z.string(), code: z.string(), address: warehouseAddressSchema }),
  items: z.array(
    z.object({
      title: z.string(),
      sku: z.string(),
      quantity: z.number(),
      serials: z.array(z.string()).catch([]),
      batches: z.array(z.string()).catch([]),
    }),
  ),
});
export type ShipmentDocument = z.output<typeof shipmentDocumentSchema>;
