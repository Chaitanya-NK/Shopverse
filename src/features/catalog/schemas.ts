import { z } from "zod";

import { INDUSTRY_IDS } from "@/features/organizations/industries";
import { slugSchema } from "@/features/organizations/schemas";
import { Constants } from "@/types/database.types";

export const addIndustriesSchema = z.object({
  organizationSlug: slugSchema,
  industries: z.array(z.enum(INDUSTRY_IDS)).min(1, "Pick at least one industry"),
});

export type AddIndustriesInput = z.input<typeof addIndustriesSchema>;

export const TRACKING_MODES = Constants.public.Enums.inventory_tracking;
export const ATTRIBUTE_TYPES = Constants.public.Enums.attribute_type;
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

/** Field types that can generate variants (one SKU per value). */
export const VARIANT_ATTRIBUTE_TYPES = [
  "select",
  "text",
  "number",
] as const satisfies AttributeType[];
export const OPTION_ATTRIBUTE_TYPES = ["select", "multiselect"] as const satisfies AttributeType[];

export const ATTRIBUTE_TYPE_LABELS: Record<AttributeType, string> = {
  text: "Text",
  number: "Number",
  boolean: "Yes / no",
  select: "One of a list",
  multiselect: "Several from a list",
  date: "Date",
};

export const hasOptions = (type: AttributeType) =>
  (OPTION_ATTRIBUTE_TYPES as readonly string[]).includes(type);
export const canBeVariant = (type: AttributeType) =>
  (VARIANT_ATTRIBUTE_TYPES as readonly string[]).includes(type);

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/** Mirrors categories.slug: 1–80 of a–z, 0–9 and "-", not starting/ending with "-". */
export const categorySlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/, "Use lowercase letters, numbers and dashes");

const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    schema.nullable(),
  );

const categoryFields = {
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80, "Name is too long"),
  slug: categorySlugSchema,
  tracking: z.enum(TRACKING_MODES),
  hsnCode: z
    .string()
    .trim()
    .regex(/^([0-9]{4,8})?$/, "HSN codes are 4–8 digits")
    .nullish()
    .transform((v) => v || null),
  gstRate: optionalNumber(
    z.number({ error: "Enter a number" }).min(0, "Can't be negative").max(100, "At most 100%"),
  ),
};

export const categoryFormSchema = z.object(categoryFields);

export const createCategorySchema = z.object({
  organizationSlug: slugSchema,
  parentId: z.uuid(),
  ...categoryFields,
});

export const updateCategorySchema = z.object({
  organizationSlug: slugSchema,
  categoryId: z.uuid(),
  ...categoryFields,
});

export const deleteCategorySchema = z.object({
  organizationSlug: slugSchema,
  categoryId: z.uuid(),
});

// ---------------------------------------------------------------------------
// Fields (attribute definitions)
// ---------------------------------------------------------------------------

const optionList = z
  .array(z.string().trim().min(1).max(60, "Options must be 60 characters or fewer"))
  .max(100, "At most 100 options")
  .refine((list) => new Set(list.map((o) => o.toLowerCase())).size === list.length, {
    error: "Options must be unique",
  });

const editableAttributeFields = {
  label: z.string().trim().min(1, "Give the field a label").max(60, "Label is too long"),
  options: optionList,
  unit: z
    .string()
    .trim()
    .max(12, "Units are at most 12 characters")
    .nullish()
    .transform((v) => v || null),
  isRequired: z.boolean(),
};

export const attributeFormSchema = z
  .object({
    ...editableAttributeFields,
    key: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{0,39}$/, "Start with a letter; use a–z, 0–9 and _"),
    type: z.enum(ATTRIBUTE_TYPES),
    isVariantOption: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (hasOptions(value.type) && value.options.length === 0) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "Add at least one option" });
    }
    if (value.isVariantOption && !canBeVariant(value.type)) {
      ctx.addIssue({
        code: "custom",
        path: ["isVariantOption"],
        message: "Only text, number and list fields can create variants",
      });
    }
  })
  .transform((value) => ({
    ...value,
    // The database requires options only for list types.
    options: hasOptions(value.type) ? value.options : [],
    // Variant options are chosen per variant, so "required" applies to details only.
    isRequired: value.isVariantOption ? false : value.isRequired,
  }));

export const createAttributeSchema = z
  .object({ organizationSlug: slugSchema, categoryId: z.uuid() })
  .and(attributeFormSchema);

export const attributeEditSchema = z.object(editableAttributeFields);

export const updateAttributeSchema = z.object({
  organizationSlug: slugSchema,
  attributeId: z.uuid(),
  ...editableAttributeFields,
});

export const deleteAttributeSchema = z.object({
  organizationSlug: slugSchema,
  attributeId: z.uuid(),
});
