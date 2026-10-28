import "server-only";

import { cache } from "react";

import { fromPostgrestError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type CollectionSummary = {
  id: string;
  shopId: string;
  title: string;
  slug: string;
  description: string | null;
  featured: boolean;
  isActive: boolean;
  productCount: number;
};

export const listCollections = cache(
  async (organizationId: string): Promise<CollectionSummary[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("collections")
      .select(
        "id, shop_id, title, slug, description, featured, is_active, collection_products (count)",
      )
      .eq("organization_id", organizationId)
      .order("sort_order")
      .order("title");
    if (error) throw fromPostgrestError(error);
    return data.map((c) => ({
      id: c.id,
      shopId: c.shop_id,
      title: c.title,
      slug: c.slug,
      description: c.description,
      featured: c.featured,
      isActive: c.is_active,
      productCount: c.collection_products[0]?.count ?? 0,
    }));
  },
);

export type CollectionProduct = {
  id: string;
  title: string;
  slug: string;
  status: string;
  coverPath: string | null;
  /** Listed in the collection's shop and active, so shoppers see it. */
  visible: boolean;
};

export const getCollection = cache(async (organizationId: string, collectionId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collections")
    .select(
      "id, shop_id, title, slug, description, featured, is_active, shop:shops (name, slug), collection_products (product_id, position)",
    )
    .eq("organization_id", organizationId)
    .eq("id", collectionId)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!data) return null;
  const ids = data.collection_products.map((p) => p.product_id);
  const [products, published] = await Promise.all([
    ids.length
      ? supabase
          .from("product_overview")
          .select("id, title, slug, status, cover_path")
          .in("id", ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? supabase
          .from("shop_products")
          .select("product_id")
          .eq("shop_id", data.shop_id)
          .eq("is_published", true)
          .in("product_id", ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (products.error) throw fromPostgrestError(products.error);
  if (published.error) throw fromPostgrestError(published.error);
  const live = new Set(published.data.map((p) => p.product_id));
  const byId = new Map(products.data.map((p) => [p.id!, p]));
  const ordered = [...data.collection_products].sort((a, b) => a.position - b.position);
  return {
    id: data.id,
    shopId: data.shop_id,
    shopName: data.shop?.name ?? "",
    shopSlug: data.shop?.slug ?? "",
    title: data.title,
    slug: data.slug,
    description: data.description,
    featured: data.featured,
    isActive: data.is_active,
    products: ordered.flatMap((cp): CollectionProduct[] => {
      const p = byId.get(cp.product_id);
      return p
        ? [
            {
              id: p.id!,
              title: p.title!,
              slug: p.slug!,
              status: p.status!,
              coverPath: p.cover_path,
              visible: p.status === "active" && live.has(p.id!),
            },
          ]
        : [];
    }),
  };
});
export type CollectionDetail = NonNullable<Awaited<ReturnType<typeof getCollection>>>;

/** Products to add: anything in the business not already in the collection. */
export const searchProductsForCollection = async (
  organizationId: string,
  exclude: string[],
  search: string,
) => {
  const supabase = await createClient();
  let query = supabase
    .from("product_overview")
    .select("id, title, slug, status, cover_path")
    .eq("organization_id", organizationId)
    .neq("status", "archived")
    .order("title")
    .limit(30);
  const q = search.trim().replace(/[%_,()]/g, " ");
  if (q) query = query.ilike("title", `%${q}%`);
  if (exclude.length) query = query.not("id", "in", `(${exclude.join(",")})`);
  const { data, error } = await query;
  if (error) throw fromPostgrestError(error);
  return data.map((p) => ({
    id: p.id!,
    title: p.title!,
    status: p.status!,
    coverPath: p.cover_path,
  }));
};
