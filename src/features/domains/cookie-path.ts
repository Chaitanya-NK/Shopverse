import "server-only";

import { headers } from "next/headers";

import { routes } from "@/config/routes";
import { CUSTOM_DOMAIN_SHOP_HEADER } from "@/features/domains/constants";

/**
 * Where a shop's cookies (cart, shopper session) live. On Shopverse they are
 * scoped to /s/<shop> so shops don't share carts; on the shop's own domain
 * pages are served from /, so the cookies are too.
 */
export async function storefrontCookiePath(shopSlug: string): Promise<string> {
  const onOwnDomain = (await headers()).get(CUSTOM_DOMAIN_SHOP_HEADER) === shopSlug;
  return onOwnDomain ? "/" : routes.storefront(shopSlug);
}
