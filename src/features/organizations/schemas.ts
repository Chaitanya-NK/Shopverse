import { z } from "zod";

import { SLUG_PATTERN } from "@/lib/slug";

export const SUPPORTED_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"] as const;

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(SLUG_PATTERN, "Use 3–48 lowercase letters, numbers or dashes (not at the start or end)");

const nameSchema = (label: string) =>
  z
    .string()
    .trim()
    .min(2, `${label} must be at least 2 characters`)
    .max(80, `${label} is too long`);

export const createOrganizationSchema = z.object({
  organizationName: nameSchema("Business name"),
  organizationSlug: slugSchema,
  shopName: nameSchema("Shop name"),
  currency: z.enum(SUPPORTED_CURRENCIES),
  warehouseName: nameSchema("Warehouse name"),
  warehouseCity: z.string().trim().min(2, "Enter a city").max(80),
});

export type CreateOrganizationInput = z.input<typeof createOrganizationSchema>;
