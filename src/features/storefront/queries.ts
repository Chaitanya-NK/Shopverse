import "server-only";

import { cache } from "react";

import {
  CATALOG_PAGE_SIZE,
  type CatalogSort,
  catalogSchema,
  categoriesSchema,
  cartVariantsSchema,
  customerOrderSchema,
  productSchema,
  storefrontShopSchema,
} from "@/features/storefront/schemas";
import { readCartLines } from "@/features/storefront/cart-cookie";
import { fromPostgrestError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/** A live shop (or a draft one, for its own staff). Null when not visible. */
export const getStorefrontShop = cache(async (slug: string) => {
  if (!/^[a-z0-9-]{3,48}$/i.test(slug)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("storefront_shop", { p_slug: slug });
  if (error) throw fromPostgrestError(error);
  return data ? storefrontShopSchema.parse(data) : null;
});

export const getStorefrontCategories = cache(async (shopId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("storefront_categories", { p_shop_id: shopId });
  if (error) throw fromPostgrestError(error);
  return categoriesSchema.parse(data ?? []);
});

export const getCatalog = cache(
  async (
    shopId: string,
    filters: { category: string | null; q: string; sort: CatalogSort; page: number },
  ) => {
    const supabase = await createClient();
    const page = Math.max(1, filters.page);
    const { data, error } = await supabase.rpc("storefront_catalog", {
      p_shop_id: shopId,
      p_category_id: filters.category ?? undefined,
      p_search: filters.q.slice(0, 100) || undefined,
      p_sort: filters.sort,
      p_limit: CATALOG_PAGE_SIZE,
      p_offset: (page - 1) * CATALOG_PAGE_SIZE,
    });
    if (error) throw fromPostgrestError(error);
    const catalog = catalogSchema.parse(data);
    return {
      ...catalog,
      page,
      pageCount: Math.max(1, Math.ceil(catalog.total / CATALOG_PAGE_SIZE)),
    };
  },
);

export const getStorefrontProduct = cache(async (shopId: string, slug: string) => {
  if (!/^[a-z0-9-]{1,120}$/i.test(slug)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("storefront_product", {
    p_shop_id: shopId,
    p_slug: slug,
  });
  if (error) throw fromPostgrestError(error);
  return data ? productSchema.parse(data) : null;
});

/** The visitor's cart for this shop, re-priced and re-checked against stock. */
export const getCart = cache(async (shopId: string) => {
  const lines = await readCartLines();
  if (lines.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("storefront_variants", {
    p_shop_id: shopId,
    p_variant_ids: lines.map((l) => l.v),
  });
  if (error) throw fromPostgrestError(error);

  const variants = new Map(cartVariantsSchema.parse(data ?? []).map((v) => [v.id, v]));
  return lines.flatMap((line) => {
    const variant = variants.get(line.v);
    return variant ? [{ ...variant, quantity: line.q }] : [];
  });
});

export type CartItem = Awaited<ReturnType<typeof getCart>>[number];

export const getCustomerOrder = cache(async (token: string) => {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("storefront_order", { p_token: token });
  if (error) throw fromPostgrestError(error);
  return data ? customerOrderSchema.parse(data) : null;
});
