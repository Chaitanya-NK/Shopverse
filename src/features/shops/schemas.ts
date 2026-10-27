import { z } from "zod";

import { GSTIN_PATTERN, gstStateCode } from "@/features/orders/india";
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

const optionalText = (max: number, message: string) =>
  z.string().trim().max(max, message).optional().default("");

/** The pages a shop can publish, keyed as stored in shops.settings. */
export const POLICY_PAGES = {
  shipping: { key: "policy_shipping", title: "Shipping policy", slug: "shipping" },
  returns: { key: "policy_returns", title: "Returns & refunds", slug: "returns" },
  privacy: { key: "policy_privacy", title: "Privacy policy", slug: "privacy" },
  terms: { key: "policy_terms", title: "Terms of service", slug: "terms" },
} as const;
export type PolicyPage = keyof typeof POLICY_PAGES;
const POLICY_MAX = 20_000;
const policyText = optionalText(POLICY_MAX, "Keep it under 20,000 characters");

/** Storefront settings kept in shops.settings (read by the storefront functions). */
export const storefrontSettingsSchema = z
  .object({
    tagline: optionalText(120, "Keep it under 120 characters"),
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
    // Business details printed on GST invoices.
    legalName: optionalText(160, "Keep it under 160 characters"),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => v === "" || GSTIN_PATTERN.test(v), "Enter a valid 15-character GSTIN")
      .optional()
      .default(""),
    businessAddress: z
      .object({
        line1: optionalText(200, "Keep it under 200 characters"),
        city: optionalText(80, "Keep it under 80 characters"),
        state: optionalText(80, "Choose a state"),
        postalCode: z
          .string()
          .trim()
          .refine((v) => v === "" || /^[1-9][0-9]{5}$/.test(v), "Enter a 6-digit PIN code")
          .optional()
          .default(""),
      })
      .optional()
      .default({ line1: "", city: "", state: "", postalCode: "" }),
    policies: z
      .object({
        shipping: policyText,
        returns: policyText,
        privacy: policyText,
        terms: policyText,
      })
      .optional()
      .default({ shipping: "", returns: "", privacy: "", terms: "" }),
    notifyCustomers: z.boolean().optional().default(true),
  })
  .superRefine((s, ctx) => {
    if (!s.gstin) return;
    // A GST invoice needs the registered name and address.
    if (!s.legalName)
      ctx.addIssue({ code: "custom", path: ["legalName"], message: "Needed on GST invoices" });
    const a = s.businessAddress;
    for (const [key, value] of [
      ["line1", a.line1],
      ["city", a.city],
      ["state", a.state],
      ["postalCode", a.postalCode],
    ] as const)
      if (!value)
        ctx.addIssue({
          code: "custom",
          path: ["businessAddress", key],
          message: "Needed on GST invoices",
        });
    const code = gstStateCode(a.state);
    if (code && s.gstin.slice(0, 2) !== code)
      ctx.addIssue({
        code: "custom",
        path: ["gstin"],
        message: `A GSTIN registered in ${a.state} starts with ${code}`,
      });
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
  const str = (k: string, from: Record<string, unknown> = s) =>
    typeof from[k] === "string" ? (from[k] as string) : "";
  const address = (
    typeof s.business_address === "object" && s.business_address !== null ? s.business_address : {}
  ) as Record<string, unknown>;
  return {
    tagline: str("tagline"),
    shippingFee: num("shipping_fee"),
    freeShippingOver: num("free_shipping_over"),
    codLimit: num("cod_limit"),
    supportEmail: str("support_email"),
    supportPhone: str("support_phone"),
    legalName: str("legal_name"),
    gstin: str("gstin"),
    businessAddress: {
      line1: str("line1", address),
      city: str("city", address),
      state: str("state", address),
      postalCode: str("postal_code", address),
    },
    policies: {
      shipping: str(POLICY_PAGES.shipping.key),
      returns: str(POLICY_PAGES.returns.key),
      privacy: str(POLICY_PAGES.privacy.key),
      terms: str(POLICY_PAGES.terms.key),
    },
    notifyCustomers: s.notify_customers !== false,
  };
}

type SettingsValue = string | number | boolean | Record<string, string> | null;

/** Form values -> the keys the database reads (null removes a key). */
export function toSettingsJson(settings: StorefrontSettings): Record<string, SettingsValue> {
  const a = settings.businessAddress;
  const hasAddress = Boolean(a.line1 || a.city || a.state || a.postalCode);
  return {
    tagline: settings.tagline || null,
    shipping_fee: settings.shippingFee,
    free_shipping_over: settings.freeShippingOver,
    cod_limit: settings.codLimit,
    support_email: settings.supportEmail || null,
    support_phone: settings.supportPhone || null,
    legal_name: settings.legalName || null,
    gstin: settings.gstin || null,
    business_address: hasAddress
      ? { line1: a.line1, city: a.city, state: a.state, postal_code: a.postalCode }
      : null,
    [POLICY_PAGES.shipping.key]: settings.policies.shipping || null,
    [POLICY_PAGES.returns.key]: settings.policies.returns || null,
    [POLICY_PAGES.privacy.key]: settings.policies.privacy || null,
    [POLICY_PAGES.terms.key]: settings.policies.terms || null,
    // Stored only when switched off; absent means on.
    notify_customers: settings.notifyCustomers ? null : false,
  };
}
