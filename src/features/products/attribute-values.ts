import { z } from "zod";

import { type CategoryAttribute } from "@/features/catalog/tree";

/**
 * Category-driven validation shared by the product form (client) and the
 * product actions (server). The database re-checks the same rules in
 * private.validate_attribute_values(), so this is about clear, early errors.
 */

export type AttributeDefinition = Pick<
  CategoryAttribute,
  "key" | "label" | "type" | "options" | "unit" | "isRequired" | "isVariantOption"
>;

/** How a product detail is held in the form. */
export type FormAttributeValue = string | boolean | string[];
/** How a product detail is stored (jsonb). */
export type StoredAttributeValue = string | number | boolean | string[];
/** A variant option value (jsonb): "128 GB", "M", 42. */
export type OptionValue = string | number;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function emptyAttributeValue(def: AttributeDefinition): FormAttributeValue {
  if (def.type === "boolean") return false;
  if (def.type === "multiselect") return [];
  return "";
}

/** Stored jsonb value -> form value (tolerates bad or missing data). */
export function toFormAttributeValue(
  def: AttributeDefinition,
  stored: unknown,
): FormAttributeValue {
  switch (def.type) {
    case "boolean":
      return stored === true;
    case "multiselect":
      return Array.isArray(stored) ? stored.filter((v): v is string => typeof v === "string") : [];
    case "number":
      return typeof stored === "number" ? String(stored) : "";
    default:
      return typeof stored === "string" || typeof stored === "number" ? String(stored) : "";
  }
}

function detailSchema(def: AttributeDefinition): z.ZodType<StoredAttributeValue | undefined> {
  const required = (message = `${def.label} is required`) => ({ message });

  switch (def.type) {
    case "boolean":
      return z.boolean().optional().default(false);
    case "number":
      return z
        .union([z.string(), z.number()])
        .optional()
        .transform((v, ctx) => {
          const raw = typeof v === "string" ? v.trim() : v;
          if (raw === "" || raw === undefined) {
            if (def.isRequired) ctx.addIssue({ code: "custom", ...required() });
            return undefined;
          }
          const n = Number(raw);
          if (!Number.isFinite(n)) {
            ctx.addIssue({ code: "custom", message: `${def.label} must be a number` });
            return z.NEVER;
          }
          return n;
        });
    case "select":
      return z
        .string()
        .optional()
        .transform((v, ctx) => {
          const value = v?.trim() ?? "";
          if (value === "") {
            if (def.isRequired)
              ctx.addIssue({ code: "custom", ...required(`Choose a ${def.label.toLowerCase()}`) });
            return undefined;
          }
          if (!def.options.includes(value)) {
            ctx.addIssue({
              code: "custom",
              message: `Choose one of the listed ${def.label.toLowerCase()} options`,
            });
            return z.NEVER;
          }
          return value;
        });
    case "multiselect":
      return z
        .array(z.string())
        .optional()
        .transform((v, ctx) => {
          const values = [...new Set(v ?? [])];
          if (values.length === 0) {
            if (def.isRequired)
              ctx.addIssue({
                code: "custom",
                ...required(`Pick at least one ${def.label.toLowerCase()}`),
              });
            return undefined;
          }
          if (values.some((x) => !def.options.includes(x))) {
            ctx.addIssue({
              code: "custom",
              message: `Only listed ${def.label.toLowerCase()} options are allowed`,
            });
            return z.NEVER;
          }
          return values;
        });
    case "date":
      return z
        .string()
        .optional()
        .transform((v, ctx) => {
          const value = v?.trim() ?? "";
          if (value === "") {
            if (def.isRequired) ctx.addIssue({ code: "custom", ...required() });
            return undefined;
          }
          if (!DATE.test(value)) {
            ctx.addIssue({ code: "custom", message: `${def.label} must be a date` });
            return z.NEVER;
          }
          return value;
        });
    default:
      return z
        .union([z.string(), z.number()])
        .optional()
        .transform((v, ctx) => {
          const value = v === undefined ? "" : String(v).trim();
          if (value === "") {
            if (def.isRequired) ctx.addIssue({ code: "custom", ...required() });
            return undefined;
          }
          if (value.length > 500) {
            ctx.addIssue({ code: "custom", message: `${def.label} is too long` });
            return z.NEVER;
          }
          return value;
        });
  }
}

/**
 * Schema for a product's details (non-variant fields). Output drops empty
 * values, matching what the database stores. Unknown keys are rejected.
 */
export function buildAttributeValuesSchema(defs: readonly AttributeDefinition[]) {
  const shape: Record<string, z.ZodType<StoredAttributeValue | undefined>> = {};
  for (const def of defs) if (!def.isVariantOption) shape[def.key] = detailSchema(def);

  return z
    .strictObject(shape)
    .transform(
      (values) =>
        Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) as Record<
          string,
          StoredAttributeValue
        >,
    );
}

/** Parse a variant option value typed into the form ("128 GB", "42"). */
export function parseOptionValue(def: AttributeDefinition, raw: string): OptionValue | null {
  const value = raw.trim();
  if (value === "") return null;
  if (def.type === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (def.type === "select" && !def.options.includes(value)) return null;
  return value.slice(0, 60);
}

/** Schema for one variant's options: only this category's variant fields, each optional. */
export function buildVariantOptionsSchema(defs: readonly AttributeDefinition[]) {
  const shape: Record<string, z.ZodType<OptionValue | undefined>> = {};
  for (const def of defs) {
    if (!def.isVariantOption) continue;
    shape[def.key] =
      def.type === "number"
        ? z.number().optional()
        : def.type === "select"
          ? z.enum(def.options as [string, ...string[]]).optional()
          : z.string().trim().min(1).max(60).optional();
  }
  return z.strictObject(shape);
}
