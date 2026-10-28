import "server-only";

import { cache } from "react";

import {
  reviewStatusSchema,
  type ReviewFilter,
  storefrontReviewsSchema,
} from "@/features/reviews/schemas";
import { readShopperToken } from "@/features/shopper/session";
import { fromPostgrestError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const REVIEWS_PAGE_SIZE = 10;

export const getProductReviews = cache(async (shopId: string, productId: string, page = 1) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("storefront_reviews", {
    p_shop_id: shopId,
    p_product_id: productId,
    p_limit: REVIEWS_PAGE_SIZE,
    p_offset: (Math.max(1, page) - 1) * REVIEWS_PAGE_SIZE,
  });
  if (error) throw fromPostgrestError(error);
  return storefrontReviewsSchema.parse(data);
});

/** Can the signed-in shopper review this product, and what did they write? */
export const getReviewStatus = cache(async (shopId: string, productId: string) => {
  const token = await readShopperToken();
  if (!token) return { signedIn: false, eligible: false, review: null };
  const { data, error } = await createAdminClient().rpc("shopper_review_status", {
    p_shop_id: shopId,
    p_token: token,
    p_product_id: productId,
  });
  if (error) throw fromPostgrestError(error);
  return reviewStatusSchema.parse(data);
});

export type StaffReview = {
  id: string;
  shopName: string;
  productTitle: string;
  productSlug: string;
  rating: number;
  title: string | null;
  body: string | null;
  status: "published" | "hidden";
  reply: string | null;
  createdAt: string;
  customerName: string | null;
  customerEmail: string | null;
};

export const STAFF_REVIEWS_PAGE_SIZE = 25;

export const listReviews = cache(
  async (organizationId: string, filter: ReviewFilter, shopId: string | null, page: number) => {
    const supabase = await createClient();
    const from = (Math.max(1, page) - 1) * STAFF_REVIEWS_PAGE_SIZE;
    let query = supabase
      .from("review_overview")
      .select(
        "id, shop_name, product_title, product_slug, rating, title, body, status, reply, created_at, customer_name, customer_email",
        { count: "exact" },
      )
      .eq("organization_id", organizationId);
    if (shopId) query = query.eq("shop_id", shopId);
    if (filter === "low") query = query.lte("rating", 2);
    if (filter === "unreplied") query = query.is("reply", null).eq("status", "published");
    if (filter === "hidden") query = query.eq("status", "hidden");
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, from + STAFF_REVIEWS_PAGE_SIZE - 1);
    if (error) throw fromPostgrestError(error);
    const total = count ?? 0;
    return {
      total,
      page: Math.max(1, page),
      pageCount: Math.max(1, Math.ceil(total / STAFF_REVIEWS_PAGE_SIZE)),
      items: data.map((r): StaffReview => ({
        id: r.id!,
        shopName: r.shop_name!,
        productTitle: r.product_title!,
        productSlug: r.product_slug!,
        rating: r.rating!,
        title: r.title,
        body: r.body,
        status: r.status as StaffReview["status"],
        reply: r.reply,
        createdAt: r.created_at!,
        customerName: r.customer_name,
        customerEmail: r.customer_email,
      })),
    };
  },
);

/** Average and count across the business, for the reviews page header. */
export const getReviewSummary = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_reviews")
    .select("rating, status")
    .eq("organization_id", organizationId)
    .limit(10000);
  if (error) throw fromPostgrestError(error);
  const published = data.filter((r) => r.status === "published");
  return {
    count: published.length,
    average: published.length
      ? Math.round((published.reduce((n, r) => n + r.rating, 0) / published.length) * 10) / 10
      : null,
    hidden: data.length - published.length,
  };
});
