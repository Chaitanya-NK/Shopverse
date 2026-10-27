import "server-only";

import { cache } from "react";

import { type ProductStatus } from "@/features/products/schemas";
import { PRODUCTS_PAGE_SIZE } from "@/features/products/search-params";
import { type VariantOptions } from "@/features/products/variants";
import { fromPostgrestError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { type Enums } from "@/types/database.types";

export type ProductListItem = {
  id: string;
  title: string;
  slug: string;
  status: ProductStatus;
  tracking: Enums<"inventory_tracking">;
  categoryName: string | null;
  variantCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  onHand: number;
  available: number;
  lowStockLocations: number;
  updatedAt: string;
};

export type ProductListFilters = {
  q: string;
  status: ProductStatus | null;
  category: string | null;
  page: number;
};

/** Escape LIKE wildcards so a search for "50%" matches literally. */
function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export const listProducts = cache(async (organizationId: string, filters: ProductListFilters) => {
  const supabase = await createClient();
  const page = Math.max(1, filters.page);
  const from = (page - 1) * PRODUCTS_PAGE_SIZE;

  let query = supabase
    .from("product_overview")
    .select(
      "id, title, slug, status, tracking, category_name, variant_count, min_price, max_price, on_hand, available, low_stock_locations, updated_at",
      { count: "exact" },
    )
    .eq("organization_id", organizationId);

  const q = filters.q.trim().slice(0, 100);
  if (q) query = query.ilike("title", likePattern(q));
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.category) query = query.eq("category_id", filters.category);

  const { data, error, count } = await query
    .order("updated_at", { ascending: false })
    .order("id")
    .range(from, from + PRODUCTS_PAGE_SIZE - 1);

  if (error) throw fromPostgrestError(error);

  const total = count ?? 0;
  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PRODUCTS_PAGE_SIZE)),
    items: data.map((p): ProductListItem => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      status: p.status,
      tracking: p.tracking,
      categoryName: p.category_name,
      variantCount: Number(p.variant_count ?? 0),
      minPrice: p.min_price,
      maxPrice: p.max_price,
      onHand: Number(p.on_hand ?? 0),
      available: Number(p.available ?? 0),
      lowStockLocations: Number(p.low_stock_locations ?? 0),
      updatedAt: p.updated_at,
    })),
  };
});

export type ProductDetail = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  status: ProductStatus;
  tracking: Enums<"inventory_tracking">;
  categoryId: string | null;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
  hsnCode: string | null;
  gstRate: number | null;
  shopIds: string[];
  variants: {
    id: string;
    sku: string;
    title: string;
    options: VariantOptions;
    price: number;
    compareAtPrice: number | null;
    costPrice: number | null;
    barcode: string | null;
  }[];
};

export const getProduct = cache(
  async (organizationId: string, productId: string): Promise<ProductDetail | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("products")
      .select(
        `id, title, slug, description, status, tracking, category_id, attributes, tags, hsn_code, gst_rate, updated_at,
         product_variants (id, sku, title, options, price, compare_at_price, cost_price, barcode, is_active, created_at),
         shop_products (shop_id)`,
      )
      .eq("organization_id", organizationId)
      .eq("id", productId)
      .maybeSingle();

    if (error) throw fromPostgrestError(error);
    if (!data) return null;

    return {
      id: data.id,
      title: data.title,
      slug: data.slug,
      description: data.description,
      status: data.status,
      tracking: data.tracking,
      categoryId: data.category_id,
      updatedAt: data.updated_at,
      attributes: isRecord(data.attributes) ? data.attributes : {},
      tags: data.tags,
      hsnCode: data.hsn_code,
      gstRate: data.gst_rate,
      shopIds: data.shop_products.map((s) => s.shop_id),
      variants: data.product_variants
        .filter((v) => v.is_active)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((v) => ({
          id: v.id,
          sku: v.sku,
          title: v.title,
          options: toVariantOptions(v.options),
          price: v.price,
          compareAtPrice: v.compare_at_price,
          costPrice: v.cost_price,
          barcode: v.barcode,
        })),
    };
  },
);

export type ProductStockRow = {
  variantId: string;
  sku: string;
  variantTitle: string;
  warehouseId: string;
  warehouseName: string;
  onHand: number;
  reserved: number;
  available: number;
  reorderPoint: number;
  isLow: boolean;
  nextExpiry: string | null;
};

export const getProductStock = cache(async (productId: string): Promise<ProductStockRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_overview")
    .select(
      "variant_id, sku, variant_title, warehouse_id, warehouse_name, on_hand, reserved, available, reorder_point, is_low, next_expiry",
    )
    .eq("product_id", productId)
    .order("sku")
    .order("warehouse_name");

  if (error) throw fromPostgrestError(error);

  return data.map((r) => ({
    variantId: r.variant_id,
    sku: r.sku,
    variantTitle: r.variant_title,
    warehouseId: r.warehouse_id,
    warehouseName: r.warehouse_name,
    onHand: r.on_hand,
    reserved: r.reserved,
    available: r.available ?? 0,
    reorderPoint: r.reorder_point,
    isLow: Boolean(r.is_low),
    nextExpiry: r.next_expiry,
  }));
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toVariantOptions(value: unknown): VariantOptions {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string | number] =>
        typeof entry[1] === "string" || typeof entry[1] === "number",
    ),
  );
}
