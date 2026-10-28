"use server";

import { refresh } from "next/cache";

import { authorizeOrganization } from "@/features/organizations/server";
import { moderateReviewSchema, reviewFormSchema } from "@/features/reviews/schemas";
import { clearShopperToken, requireShopperToken } from "@/features/shopper/session";
import { getStorefrontShop } from "@/features/storefront/queries";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";

export const saveReview = createAction({
  name: "reviews.save",
  schema: reviewFormSchema,
  requireAuth: false,
  handler: async (input) => {
    const shop = await getStorefrontShop(input.shopSlug);
    if (!shop) throw Errors.notFound("Shop");
    const token = await requireShopperToken();
    const { error } = await createAdminClient().rpc("shopper_save_review", {
      p_shop_id: shop.id,
      p_token: token,
      p_product_id: input.productId,
      p_rating: input.rating,
      p_title: input.title,
      p_body: input.body,
    });
    if (error) {
      if (error.code === "42501" && /session|sign/i.test(error.message)) {
        await clearShopperToken(input.shopSlug);
        throw Errors.unauthenticated();
      }
      throw fromPostgrestError(error);
    }
    refresh();
    return null;
  },
});

export const moderateReview = createAction({
  name: "reviews.moderate",
  schema: moderateReviewSchema,
  handler: async (input, { supabase, user }) => {
    await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "reviews.manage",
      "You don't have permission to manage reviews.",
    );
    const { error } = await supabase.rpc("moderate_review", {
      p_review_id: input.reviewId,
      p_status: input.status,
      p_reply: input.reply ?? undefined,
    });
    if (error) throw fromPostgrestError(error);
    refresh();
    return null;
  },
});
