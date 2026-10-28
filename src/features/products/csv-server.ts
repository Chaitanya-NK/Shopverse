import "server-only";

import { toCsv, type CsvValue } from "@/features/analytics/csv";
import { type OptionValue } from "@/features/products/attribute-values";
import {
  ATTRIBUTE_PREFIX,
  type ExistingProduct,
  type ImportCategory,
  type ImportContext,
  LIST_SEPARATOR,
  OPTION_PREFIX,
  type PlannedProduct,
  productCsvHeaders,
} from "@/features/products/csv-import";
import { toProductJson, toVariantJson } from "@/features/products/rpc";
import { type ProductStatus } from "@/features/products/schemas";
import { fromPostgrestError } from "@/lib/errors";
import { type ServerSupabaseClient } from "@/lib/supabase/server";

const PAGE = 500;

export async function loadImportCategories(
  supabase: ServerSupabaseClient,
  organizationId: string,
): Promise<ImportCategory[]> {
  const { data, error } = await supabase
    .from("categories")
    .select(
      "id, name, slug, parent_id, attribute_definitions (key, label, type, options, unit, is_required, is_variant_option, sort_order)",
    )
    .eq("organization_id", organizationId);
  if (error) throw fromPostgrestError(error);
  const byId = new Map(data.map((c) => [c.id, c]));
  const pathOf = (id: string, depth = 0): string => {
    const c = byId.get(id)!;
    return c.parent_id && byId.has(c.parent_id) && depth < 10
      ? `${pathOf(c.parent_id, depth + 1)}/${c.slug}`
      : c.slug;
  };
  return data.map((c) => ({
    id: c.id,
    name: c.name,
    path: pathOf(c.id),
    defs: [...c.attribute_definitions]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((a) => ({
        key: a.key,
        label: a.label,
        type: a.type,
        options: a.options,
        unit: a.unit,
        isRequired: a.is_required,
        isVariantOption: a.is_variant_option,
      })),
  }));
}

const PRODUCT_SELECT =
  "id, slug, title, description, status, category_id, attributes, tags, hsn_code, gst_rate, shop_products (shop_id), product_variants (id, sku, title, options, price, compare_at_price, cost_price, barcode, is_active, created_at)";

type ProductRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: ProductStatus;
  category_id: string | null;
  attributes: unknown;
  tags: string[];
  hsn_code: string | null;
  gst_rate: number | null;
  shop_products: { shop_id: string }[];
  product_variants: {
    id: string;
    sku: string;
    title: string;
    options: unknown;
    price: number;
    compare_at_price: number | null;
    cost_price: number | null;
    barcode: string | null;
    is_active: boolean;
    created_at: string;
  }[];
};

function toExisting(p: ProductRow): ExistingProduct {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    status: p.status,
    categoryId: p.category_id,
    attributes: (p.attributes ?? {}) as Record<string, unknown>,
    tags: p.tags,
    hsnCode: p.hsn_code,
    gstRate: p.gst_rate,
    shopIds: p.shop_products.map((s) => s.shop_id),
    variants: p.product_variants
      .filter((v) => v.is_active)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((v) => ({
        id: v.id,
        sku: v.sku,
        title: v.title,
        options: (v.options ?? {}) as Record<string, OptionValue>,
        price: v.price,
        compareAtPrice: v.compare_at_price,
        costPrice: v.cost_price,
        barcode: v.barcode,
      })),
  };
}

export async function loadImportContext(
  supabase: ServerSupabaseClient,
  organization: { id: string; slug: string },
  handles: string[],
): Promise<ImportContext> {
  const [categories, shops] = await Promise.all([
    loadImportCategories(supabase, organization.id),
    supabase.from("shops").select("id, slug").eq("organization_id", organization.id),
  ]);
  if (shops.error) throw fromPostgrestError(shops.error);
  const existing = new Map<string, ExistingProduct>();
  for (let i = 0; i < handles.length; i += 200) {
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("organization_id", organization.id)
      .in("slug", handles.slice(i, i + 200));
    if (error) throw fromPostgrestError(error);
    for (const p of data as ProductRow[]) existing.set(p.slug, toExisting(p));
  }
  return { organizationSlug: organization.slug, categories, shops: shops.data, existing };
}

export type ImportOutcome = { handle: string; title: string; ok: boolean; message?: string };

/** Create or update each valid product. One failure doesn't stop the rest. */
export async function runImport(
  supabase: ServerSupabaseClient,
  organizationId: string,
  products: PlannedProduct[],
): Promise<ImportOutcome[]> {
  const outcomes: ImportOutcome[] = [];
  for (const p of products) {
    if (!p.payload) continue;
    const { error } =
      p.action === "create"
        ? await supabase.rpc("create_product", {
            p_organization_id: organizationId,
            p_product: { ...toProductJson(p.payload), category_id: p.payload.categoryId },
            p_variants: p.payload.variants.map(toVariantJson),
            p_shop_ids: p.payload.shopIds,
          })
        : await supabase.rpc("update_product", {
            p_product_id: p.productId,
            p_product: toProductJson(p.payload),
            p_variants: p.payload.variants.map(toVariantJson),
            p_shop_ids: p.payload.shopIds,
          });
    if (error) {
      const message =
        error.code === "23505"
          ? /sku/i.test(error.message + (error.details ?? ""))
            ? "A SKU in this product is already used by another product"
            : "Another product already uses this handle or option combination"
          : fromPostgrestError(error).message;
      outcomes.push({ handle: p.handle, title: p.title, ok: false, message });
    } else outcomes.push({ handle: p.handle, title: p.title, ok: true });
  }
  return outcomes;
}

/** Every product, one row per active variant, in the same layout the import reads. */
export async function productsCsv(supabase: ServerSupabaseClient, organizationId: string) {
  const [categories, shops] = await Promise.all([
    loadImportCategories(supabase, organizationId),
    supabase.from("shops").select("id, slug").eq("organization_id", organizationId),
  ]);
  if (shops.error) throw fromPostgrestError(shops.error);
  const shopSlug = new Map(shops.data.map((s) => [s.id, s.slug]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const headers = productCsvHeaders(categories);

  const rows: CsvValue[][] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("organization_id", organizationId)
      .order("title")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw fromPostgrestError(error);
    for (const raw of data as ProductRow[]) {
      const p = toExisting(raw);
      const category = p.categoryId ? categoryById.get(p.categoryId) : undefined;
      p.variants.forEach((v, i) => {
        const product = i === 0;
        const cells: Record<string, CsvValue> = {
          handle: p.slug,
          sku: v.sku,
          variant_title: v.title,
          price: v.price,
          compare_at_price: v.compareAtPrice,
          cost_price: v.costPrice,
          barcode: v.barcode,
          ...(product && {
            title: p.title,
            description: p.description,
            status: p.status,
            category: category?.path ?? "",
            tags: p.tags.join(LIST_SEPARATOR),
            hsn_code: p.hsnCode,
            gst_rate: p.gstRate,
            shops: p.shopIds
              .map((id) => shopSlug.get(id))
              .filter(Boolean)
              .join(LIST_SEPARATOR),
          }),
        };
        for (const [k, value] of Object.entries(v.options))
          cells[`${OPTION_PREFIX}${k}`] = String(value);
        if (product)
          for (const [k, value] of Object.entries(p.attributes))
            cells[`${ATTRIBUTE_PREFIX}${k}`] = Array.isArray(value)
              ? value.join(LIST_SEPARATOR)
              : typeof value === "boolean"
                ? value
                  ? "yes"
                  : "no"
                : (value as CsvValue);
        rows.push(headers.map((h) => cells[h] ?? null));
      });
    }
    if (data.length < PAGE) break;
  }
  return toCsv(headers, rows);
}
