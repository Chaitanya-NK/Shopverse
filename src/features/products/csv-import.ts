import { type z } from "zod";

import {
  type AttributeDefinition,
  type OptionValue,
  parseOptionValue,
} from "@/features/products/attribute-values";
import {
  createProductSchema,
  PRODUCT_STATUSES,
  type ProductStatus,
  updateProductSchema,
  withCategoryRules,
} from "@/features/products/schemas";
import { slugify } from "@/lib/slug";

/**
 * Product CSV: one row per variant. Rows with the same `handle` (the
 * product's link) belong to one product. A handle that already exists updates
 * that product, and blank cells keep what's there, so "export, change the
 * prices, import" is safe. Variants are matched by SKU; a new SKU adds a
 * variant and existing variants not in the file are left alone.
 */
export const PRODUCT_CSV_COLUMNS = [
  "handle",
  "title",
  "description",
  "status",
  "category",
  "tags",
  "hsn_code",
  "gst_rate",
  "shops",
  "sku",
  "variant_title",
  "price",
  "compare_at_price",
  "cost_price",
  "barcode",
] as const;
export const OPTION_PREFIX = "option:";
export const ATTRIBUTE_PREFIX = "attribute:";
/** Separates several values in one cell (tags, shops, multi-choice details). */
export const LIST_SEPARATOR = "|";
export const MAX_IMPORT_ROWS = 2000;

export type ImportCategory = {
  id: string;
  path: string;
  name: string;
  defs: AttributeDefinition[];
};
export type ImportShop = { id: string; slug: string };
export type ExistingVariant = {
  id: string;
  sku: string;
  title: string;
  options: Record<string, OptionValue>;
  price: number;
  compareAtPrice: number | null;
  costPrice: number | null;
  barcode: string | null;
};
export type ExistingProduct = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: ProductStatus;
  categoryId: string | null;
  attributes: Record<string, unknown>;
  tags: string[];
  hsnCode: string | null;
  gstRate: number | null;
  shopIds: string[];
  variants: ExistingVariant[];
};
export type ImportContext = {
  organizationSlug: string;
  categories: ImportCategory[];
  shops: ImportShop[];
  existing: Map<string, ExistingProduct>;
};

export type CreatePayload = z.output<typeof createProductSchema>;
export type UpdatePayload = z.output<typeof updateProductSchema>;

export type PlannedProduct = {
  handle: string;
  /** Spreadsheet line numbers (header is line 1). */
  lines: number[];
  title: string;
  errors: string[];
  variantCount: number;
  newVariants: number;
} & (
  | { action: "create"; payload: CreatePayload | null }
  | { action: "update"; productId: string; payload: UpdatePayload | null }
);

export type ImportPlan = { products: PlannedProduct[]; errors: string[] };

const blank = (v: string | undefined): v is undefined | "" => v === undefined || v.trim() === "";
const list = (v: string) =>
  v
    .split(LIST_SEPARATOR)
    .map((x) => x.trim())
    .filter(Boolean);

function findCategory(categories: ImportCategory[], value: string): ImportCategory | string {
  const v = value.trim().toLowerCase();
  const byPath = categories.find((c) => c.path === v);
  if (byPath) return byPath;
  const matches = categories.filter(
    (c) => c.path.split("/").at(-1) === v || c.name.toLowerCase() === v,
  );
  if (matches.length === 1) return matches[0]!;
  return matches.length === 0
    ? `Category “${value}” doesn't exist`
    : `More than one category is called “${value}”. Use its full path, like ${matches[0]!.path}`;
}

function attributeValue(def: AttributeDefinition, raw: string): unknown {
  if (def.type === "boolean") return /^(yes|true|1|y)$/i.test(raw.trim());
  if (def.type === "multiselect") return list(raw);
  return raw.trim();
}

/** Turn "variants.2.price" into "SKU KURTA-M: price …". */
function describeIssue(path: PropertyKey[], message: string, skus: string[]): string {
  const [head, index, field] = path;
  if (head === "variants" && typeof index === "number") {
    return `SKU ${skus[index] ?? `#${index + 1}`}${field ? ` (${String(field)})` : ""}: ${message}`;
  }
  if (head === "attributes" && path[1]) return `${String(path[1])}: ${message}`;
  return path.length ? `${path.map(String).join(".")}: ${message}` : message;
}

export function planProductImport(
  records: Record<string, string>[],
  headers: string[],
  ctx: ImportContext,
): ImportPlan {
  const errors: string[] = [];
  if (records.length > MAX_IMPORT_ROWS) {
    return {
      products: [],
      errors: [`The file has ${records.length} rows. Import at most ${MAX_IMPORT_ROWS} at a time.`],
    };
  }
  for (const required of ["sku"]) {
    if (!headers.includes(required)) errors.push(`The file needs a “${required}” column.`);
  }
  if (!headers.includes("handle") && !headers.includes("title"))
    errors.push("The file needs a “handle” or “title” column.");
  if (errors.length) return { products: [], errors };

  const groups = new Map<string, { lines: number[]; rows: Record<string, string>[] }>();
  records.forEach((row, i) => {
    const line = i + 2;
    const handle = (row.handle?.trim() || slugify(row.title ?? "", 120)).toLowerCase();
    if (!handle) {
      errors.push(`Line ${line}: needs a handle or a title.`);
      return;
    }
    const group = groups.get(handle) ?? { lines: [], rows: [] };
    group.lines.push(line);
    group.rows.push(row);
    groups.set(handle, group);
  });

  const products = [...groups].map(([handle, { lines, rows }]) =>
    planProduct(handle, lines, rows, ctx),
  );
  return { products, errors };
}

function planProduct(
  handle: string,
  lines: number[],
  rows: Record<string, string>[],
  ctx: ImportContext,
): PlannedProduct {
  const first = (col: string) =>
    rows
      .map((r) => r[col])
      .find((v) => !blank(v))
      ?.trim();
  const existing = ctx.existing.get(handle);
  const problems: string[] = [];

  // Category: needed to create; can't be changed by import.
  let category: ImportCategory | undefined;
  const categoryCell = first("category");
  if (existing) {
    category = ctx.categories.find((c) => c.id === existing.categoryId);
  } else if (!categoryCell) {
    problems.push("Choose a category for a new product");
  } else {
    const found = findCategory(ctx.categories, categoryCell);
    if (typeof found === "string") problems.push(found);
    else category = found;
  }
  const defs = category?.defs ?? [];

  const statusCell = first("status")?.toLowerCase();
  if (statusCell && !(PRODUCT_STATUSES as readonly string[]).includes(statusCell))
    problems.push(`Status must be one of ${PRODUCT_STATUSES.join(", ")}`);

  let shopIds = existing?.shopIds ?? [];
  const shopsCell = first("shops");
  if (shopsCell) {
    shopIds = [];
    for (const slug of list(shopsCell)) {
      const shop = ctx.shops.find((s) => s.slug === slug.toLowerCase());
      if (shop) shopIds.push(shop.id);
      else problems.push(`Shop “${slug}” doesn't exist`);
    }
  }

  const attributes: Record<string, unknown> = {};
  for (const def of defs) {
    if (def.isVariantOption) continue;
    if (existing && existing.attributes[def.key] !== undefined)
      attributes[def.key] = existing.attributes[def.key];
    const cell = first(`${ATTRIBUTE_PREFIX}${def.key}`);
    if (cell !== undefined) attributes[def.key] = attributeValue(def, cell);
  }

  // Variants: existing ones keep their ids and options; CSV cells override.
  type DraftVariant = {
    id?: string;
    sku: string;
    title: string;
    options: Record<string, string | number>;
    price: number | string;
    compareAtPrice: number | string | null;
    costPrice: number | string | null;
    barcode: string | null;
  };
  const variants: DraftVariant[] = (existing?.variants ?? []).map((v) => ({
    id: v.id,
    sku: v.sku,
    title: v.title,
    options: v.options,
    price: v.price,
    compareAtPrice: v.compareAtPrice,
    costPrice: v.costPrice,
    barcode: v.barcode,
  }));
  let newVariants = 0;
  rows.forEach((row, i) => {
    const sku = row.sku?.trim() ?? "";
    if (!sku) {
      problems.push(`Line ${lines[i]}: needs a SKU`);
      return;
    }
    const match = variants.find((v) => v.sku.toUpperCase() === sku.toUpperCase());
    const cell = (col: string) => (blank(row[col]) ? undefined : row[col]!.trim());
    if (match) {
      match.title = cell("variant_title") ?? match.title;
      match.price = cell("price") ?? match.price;
      match.compareAtPrice = cell("compare_at_price") ?? match.compareAtPrice;
      match.costPrice = cell("cost_price") ?? match.costPrice;
      match.barcode = cell("barcode") ?? match.barcode;
      return;
    }
    const options: Record<string, string | number> = {};
    for (const def of defs) {
      if (!def.isVariantOption) continue;
      const raw = cell(`${OPTION_PREFIX}${def.key}`);
      if (raw === undefined) continue;
      const value = parseOptionValue(def, raw);
      if (value === null)
        problems.push(`SKU ${sku}: “${raw}” isn't a valid ${def.label.toLowerCase()}`);
      else options[def.key] = value;
    }
    newVariants++;
    variants.push({
      sku,
      title: cell("variant_title") ?? (Object.values(options).join(" / ") || "Default"),
      options,
      price: cell("price") ?? "",
      compareAtPrice: cell("compare_at_price") ?? null,
      costPrice: cell("cost_price") ?? null,
      barcode: cell("barcode") ?? null,
    });
  });

  const title = first("title") ?? existing?.title ?? "";
  const base = {
    organizationSlug: ctx.organizationSlug,
    title,
    slug: handle,
    description: first("description") ?? existing?.description ?? null,
    status: (statusCell as ProductStatus | undefined) ?? existing?.status ?? "draft",
    tags: first("tags") !== undefined ? list(first("tags")!) : (existing?.tags ?? []),
    attributes,
    hsnCode: first("hsn_code") ?? existing?.hsnCode ?? null,
    gstRate: first("gst_rate") ?? existing?.gstRate ?? null,
    shopIds,
    variants,
  };
  const skus = base.variants.map((v) => v.sku);
  const common = {
    handle,
    lines,
    title: title || handle,
    variantCount: variants.length,
    newVariants,
  };

  if (existing) {
    const parsed = withCategoryRules(updateProductSchema, defs).safeParse({
      ...base,
      productId: existing.id,
    });
    if (!parsed.success)
      problems.push(...parsed.error.issues.map((i) => describeIssue(i.path, i.message, skus)));
    return {
      ...common,
      action: "update",
      productId: existing.id,
      errors: problems,
      payload: problems.length || !parsed.success ? null : (parsed.data as UpdatePayload),
    };
  }
  const parsed = withCategoryRules(createProductSchema, defs).safeParse({
    ...base,
    categoryId: category?.id,
  });
  if (!parsed.success && category)
    problems.push(...parsed.error.issues.map((i) => describeIssue(i.path, i.message, skus)));
  return {
    ...common,
    action: "create",
    errors: problems,
    payload: problems.length || !parsed.success ? null : (parsed.data as CreatePayload),
  };
}

/** Header row for an export or a blank template, including this business's option and detail columns. */
export function productCsvHeaders(categories: ImportCategory[]): string[] {
  const options = new Set<string>();
  const details = new Set<string>();
  for (const c of categories)
    for (const d of c.defs) (d.isVariantOption ? options : details).add(d.key);
  return [
    ...PRODUCT_CSV_COLUMNS,
    ...[...options].sort().map((k) => `${OPTION_PREFIX}${k}`),
    ...[...details].sort().map((k) => `${ATTRIBUTE_PREFIX}${k}`),
  ];
}
