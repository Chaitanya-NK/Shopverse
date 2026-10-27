import { z } from "zod";

import { phoneSchema } from "@/features/orders/schemas";
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

const optionalAmount = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v, ctx) => {
    const raw = typeof v === "string" ? v.replace(/[,\s₹]/g, "") : v;
    if (raw === "" || raw === null || raw === undefined) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 10_000_000) {
      ctx.addIssue({ code: "custom", message: "Enter an amount of 0 or more" });
      return z.NEVER;
    }
    return Math.round(n * 100) / 100;
  });

/** Storefront settings kept in shops.settings (read by the storefront functions). */
export const storefrontSettingsSchema = z.object({
  tagline: z.string().trim().max(120, "Keep it under 120 characters").optional().default(""),
  shippingFee: optionalAmount,
  freeShippingOver: optionalAmount,
  codLimit: optionalAmount,
  supportEmail: z
    .union([z.literal(""), z.email("Enter a valid email")])
    .optional()
    .default(""),
  supportPhone: z
    .union([z.literal(""), phoneSchema])
    .optional()
    .default(""),
});

export type StorefrontSettings = z.output<typeof storefrontSettingsSchema>;

export const SHOP_EDITABLE_STATUSES = ["draft", "live", "paused"] as const;

export const updateShopSchema = z.object({
  organizationSlug: slugSchema,
  shopId: z.uuid(),
  name: z
    .string()
    .trim()
    .min(2, "Shop name must be at least 2 characters")
    .max(80, "Shop name is too long"),
  status: z.enum(SHOP_EDITABLE_STATUSES),
  settings: storefrontSettingsSchema,
});

export type UpdateShopInput = z.input<typeof updateShopSchema>;

/** shops.settings jsonb -> form values, tolerating anything unexpected. */
export function readStorefrontSettings(value: unknown): StorefrontSettings {
  const s = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const num = (k: string) => (typeof s[k] === "number" ? (s[k] as number) : null);
  const str = (k: string) => (typeof s[k] === "string" ? (s[k] as string) : "");
  return {
    tagline: str("tagline"),
    shippingFee: num("shipping_fee"),
    freeShippingOver: num("free_shipping_over"),
    codLimit: num("cod_limit"),
    supportEmail: str("support_email"),
    supportPhone: str("support_phone"),
  };
}

/** Form values -> the keys the database reads (unset values are removed). */
export function toSettingsJson(
  settings: StorefrontSettings,
): Record<string, string | number | null> {
  return {
    tagline: settings.tagline || null,
    shipping_fee: settings.shippingFee,
    free_shipping_over: settings.freeShippingOver,
    cod_limit: settings.codLimit,
    support_email: settings.supportEmail || null,
    support_phone: settings.supportPhone || null,
  };
}
