import "server-only";

import { cache } from "react";

import { readShopperToken } from "@/features/shopper/session";
import { orderAccessSchema, shopperOrdersSchema } from "@/features/shopper/schemas";
import { catalogSchema } from "@/features/storefront/schemas";
import { fromPostgrestError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";

export const ACCOUNT_ORDERS_PAGE_SIZE = 10;

export const getShopperOrders = cache(async (shopId: string, page: number) => {
  const token = await readShopperToken();
  if (!token) return null;
  const current = Math.max(1, page);
  const { data, error } = await createAdminClient().rpc("shopper_orders", {
    p_shop_id: shopId,
    p_token: token,
    p_limit: ACCOUNT_ORDERS_PAGE_SIZE,
    p_offset: (current - 1) * ACCOUNT_ORDERS_PAGE_SIZE,
  });
  if (error) throw fromPostgrestError(error);
  const orders = shopperOrdersSchema.parse(data);
  return {
    ...orders,
    page: current,
    pageCount: Math.max(1, Math.ceil(orders.total / ACCOUNT_ORDERS_PAGE_SIZE)),
  };
});

export const getShopperWishlist = cache(async (shopId: string) => {
  const token = await readShopperToken();
  if (!token) return null;
  const { data, error } = await createAdminClient().rpc("shopper_wishlist", {
    p_shop_id: shopId,
    p_token: token,
  });
  if (error) throw fromPostgrestError(error);
  return catalogSchema.shape.items.parse(data ?? []);
});

/** What the signed-in shopper may do with an order; null if it isn't theirs. */
export const getOrderAccess = cache(async (shopId: string, orderToken: string) => {
  const token = await readShopperToken();
  if (!token) return null;
  const { data, error } = await createAdminClient().rpc("shopper_order_access", {
    p_shop_id: shopId,
    p_token: token,
    p_order_token: orderToken,
  });
  if (error) throw fromPostgrestError(error);
  return data ? orderAccessSchema.parse(data) : null;
});
