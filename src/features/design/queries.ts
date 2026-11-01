import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { type Banner } from "@/features/branding/schemas";
import { DESIGN_PREVIEW_COOKIE } from "@/features/design/preview";
import { defaultDesign, type PresetContext } from "@/features/design/presets";
import { type Design, parseDesign } from "@/features/design/schema";
import { fromPostgrestError } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type ShopForDesign = {
  id: string;
  name: string;
  tagline: string | null;
  currency: string;
  shippingFee: number;
  freeShippingOver: number | null;
  branding: { banners: Banner[] };
};

export function deliveryNote(
  shop: Pick<ShopForDesign, "currency" | "shippingFee" | "freeShippingOver">,
) {
  return shop.freeShippingOver !== null
    ? `Free delivery over ${formatMoney(shop.freeShippingOver, shop.currency)}`
    : shop.shippingFee > 0
      ? `Delivery ${formatMoney(shop.shippingFee, shop.currency)}`
      : "Free delivery";
}

export function presetContext(
  shop: ShopForDesign,
  extra: Pick<PresetContext, "collections" | "categories"> = { collections: [], categories: [] },
): PresetContext {
  return {
    name: shop.name,
    tagline: shop.tagline,
    deliveryNote: deliveryNote(shop),
    banners: shop.branding.banners,
    ...extra,
  };
}

/** Is this browser previewing the shop's unpublished design? */
export async function isPreviewingDesign(shopId: string): Promise<boolean> {
  const value = (await cookies()).get(DESIGN_PREVIEW_COOKIE)?.value ?? "";
  return value.split(",").includes(shopId);
}

/**
 * The design a storefront page renders: the published one, the draft for
 * staff previewing it, or the classic layout when the shop has none.
 */
export const getStorefrontDesign = cache(
  async (shop: ShopForDesign): Promise<{ design: Design; preview: boolean }> => {
    const preview = await isPreviewingDesign(shop.id);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("storefront_design", {
      p_shop_id: shop.id,
      p_preview: preview,
    });
    if (error) throw fromPostgrestError(error);
    const fallback = defaultDesign(presetContext(shop));
    return { design: data ? parseDesign(data, fallback) : fallback, preview };
  },
);

/** The live design only (for sitemaps and other shared responses). */
export const getPublishedDesign = cache(async (shop: ShopForDesign): Promise<Design> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("storefront_design", { p_shop_id: shop.id });
  if (error) throw fromPostgrestError(error);
  const fallback = defaultDesign(presetContext(shop));
  return data ? parseDesign(data, fallback) : fallback;
});

export type DesignEditorData = {
  design: Design;
  version: number;
  hasDraft: boolean;
  publishedAt: string | null;
  draftUpdatedAt: string | null;
  collections: { id: string; slug: string; title: string }[];
  categories: { id: string; name: string }[];
  products: { slug: string; title: string }[];
};

/** Everything the design editor starts from. RLS limits it to the shop's staff. */
export const getDesignEditor = cache(
  async (organizationId: string, shop: ShopForDesign): Promise<DesignEditorData> => {
    const supabase = await createClient();
    const [design, collections, categories, products] = await Promise.all([
      supabase
        .from("shop_designs")
        .select("draft, published, version, published_at, draft_updated_at")
        .eq("shop_id", shop.id)
        .maybeSingle(),
      supabase
        .from("collections")
        .select("id, slug, title")
        .eq("organization_id", organizationId)
        .eq("shop_id", shop.id)
        .eq("is_active", true)
        .order("sort_order")
        .order("title"),
      supabase
        .from("categories")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("shop_products")
        .select("products!inner(slug, title, status)")
        .eq("shop_id", shop.id)
        .eq("is_published", true)
        .eq("products.status", "active")
        .limit(500),
    ]);
    for (const r of [design, collections, categories, products])
      if (r.error) throw fromPostgrestError(r.error);

    const lists = {
      collections: collections.data ?? [],
      categories: categories.data ?? [],
    };
    const fallback = defaultDesign(presetContext(shop, lists));
    const row = design.data;
    return {
      design: parseDesign(row?.draft ?? row?.published ?? null, fallback),
      version: row?.version ?? 0,
      hasDraft: Boolean(row?.draft),
      publishedAt: row?.published_at ?? null,
      draftUpdatedAt: row?.draft_updated_at ?? null,
      ...lists,
      products: (products.data ?? [])
        .map((r) => r.products as unknown as { slug: string; title: string })
        .sort((a, b) => a.title.localeCompare(b.title)),
    };
  },
);
