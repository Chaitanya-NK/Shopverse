import { z } from "zod";

import { slugSchema, SUPPORTED_CURRENCIES } from "@/features/organizations/schemas";

export const createShopSchema = z.object({
  organizationSlug: slugSchema,
  name: z
    .string()
    .trim()
    .min(2, "Shop name must be at least 2 characters")
    .max(80, "Shop name is too long"),
  slug: slugSchema,
  currency: z.enum(SUPPORTED_CURRENCIES),
});

export type CreateShopInput = z.input<typeof createShopSchema>;

/** URL search param used by the shop switcher (`?shop=<slug>`). Absent = all shops. */
export const SHOP_PARAM = "shop";
