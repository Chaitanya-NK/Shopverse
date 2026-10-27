import { z } from "zod";

import { slugSchema } from "@/features/organizations/schemas";
import {
  type AttributeDefinition,
  buildAttributeValuesSchema,
  buildVariantOptionsSchema,
} from "@/features/products/attribute-values";
import { MAX_VARIANTS } from "@/features/products/variants";
import { Constants } from "@/types/database.types";

export const PRODUCT_STATUSES = Constants.public.Enums.product_status;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
};

/** Mirrors products.slug: 1–120 of a–z, 0–9 and "-". */
export const productSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/, "Use lowercase letters, numbers and dashes");

const MAX_MONEY = 9_999_999_999.99;

const moneyValue = (label: string) =>
  z.coerce
    .number({ error: `${label} must be a number` })
    .min(0, `${label} can't be negative`)
    .max(MAX_MONEY, `${label} is too large`)
    .transform((n) => Math.round(n * 100) / 100);

const requiredMoney = (label: string) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    if (typeof v === "string" && v.trim() === "") {
      ctx.addIssue({ code: "custom", message: `Enter a ${label.toLowerCase()}` });
      return z.NEVER;
    }
    const parsed = moneyValue(label).safeParse(v);
    if (!parsed.success) {
      ctx.addIssue({
        code: "custom",
        message: parsed.error.issues[0]?.message ?? "Invalid amount",
      });
      return z.NEVER;
    }
    return parsed.data;
  });

const optionalMoney = (label: string) =>
  z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v, ctx) => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return null;
      const parsed = moneyValue(label).safeParse(v);
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          message: parsed.error.issues[0]?.message ?? "Invalid amount",
        });
        return z.NEVER;
      }
      return parsed.data;
    });

export const variantRowSchema = z
  .object({
    id: z.uuid().optional(),
    options: z.record(z.string(), z.union([z.string(), z.number()])),
    title: z.string().trim().max(120, "Title is too long"),
    sku: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._-]{2,64}$/, "2–64 letters, numbers, dots, dashes or underscores"),
    price: requiredMoney("Price"),
    compareAtPrice: optionalMoney("Compare-at price"),
    costPrice: optionalMoney("Cost"),
    barcode: z
      .string()
      .trim()
      .max(64, "Barcode is too long")
      .nullish()
      .transform((v) => v || null),
  })
  .superRefine((row, ctx) => {
    if (row.compareAtPrice !== null && row.compareAtPrice <= row.price) {
      ctx.addIssue({
        code: "custom",
        path: ["compareAtPrice"],
        message: "Should be higher than the price",
      });
    }
  });

export const variantsSchema = z
  .array(variantRowSchema)
  .min(1, "Add at least one variant")
  .max(MAX_VARIANTS, `A product can have at most ${MAX_VARIANTS} variants`)
  .superRefine((rows, ctx) => {
    const seen = new Map<string, number>();
    rows.forEach((row, index) => {
      const key = row.sku.toUpperCase();
      if (seen.has(key)) {
        ctx.addIssue({ code: "custom", path: [index, "sku"], message: "Duplicate SKU" });
      } else seen.set(key, index);
    });
  });

const productFields = {
  title: z
    .string()
    .trim()
    .min(2, "Title must be at least 2 characters")
    .max(160, "Title is too long"),
  slug: productSlugSchema,
  description: z
    .string()
    .trim()
    .max(5000, "Keep the description under 5,000 characters")
    .nullish()
    .transform((v) => v || null),
  status: z.enum(PRODUCT_STATUSES),
  tags: z
    .array(z.string().trim().min(1).max(40, "Tags are at most 40 characters"))
    .max(20, "At most 20 tags"),
  /** Validated per category by withCategoryRules(). */
  attributes: z.record(z.string(), z.unknown()),
  hsnCode: z
    .string()
    .trim()
    .regex(/^([0-9]{4,8})?$/, "HSN codes are 4–8 digits")
    .nullish()
    .transform((v) => v || null),
  gstRate: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v, ctx) => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        ctx.addIssue({ code: "custom", message: "Enter a rate between 0 and 100" });
        return z.NEVER;
      }
      return n;
    }),
  shopIds: z.array(z.uuid()).max(100),
  variants: variantsSchema,
};

export const productFormSchema = z.object({
  ...productFields,
  categoryId: z.uuid({ error: "Choose a category" }),
});

export const createProductSchema = z.object({
  organizationSlug: slugSchema,
  ...productFormSchema.shape,
});

export const updateProductSchema = z.object({
  organizationSlug: slugSchema,
  productId: z.uuid(),
  ...productFields,
});

/**
 * Add the chosen category's rules: product details are typed and checked
 * against its fields, and each variant's options must use its variant fields.
 */
export function withCategoryRules<T extends z.ZodObject>(
  schema: T,
  defs: readonly AttributeDefinition[],
) {
  const optionsSchema = buildVariantOptionsSchema(defs);
  return schema.extend({
    attributes: buildAttributeValuesSchema(defs),
    variants: variantsSchema.superRefine((rows, ctx) => {
      rows.forEach((row, index) => {
        if (!optionsSchema.safeParse(row.options).success) {
          ctx.addIssue({
            code: "custom",
            path: [index, "title"],
            message: "Uses an option this category doesn’t have",
          });
        }
      });
    }),
  });
}
