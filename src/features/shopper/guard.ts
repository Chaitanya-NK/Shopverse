import "server-only";

import { notFound, redirect } from "next/navigation";

import { routes } from "@/config/routes";
import { getShopper } from "@/features/shopper/session";
import { getStorefrontShop } from "@/features/storefront/queries";

/** For account pages: the shop and the signed-in shopper, or a sign-in redirect. */
export async function requireAccountPage(shopSlug: string, path: (slug: string) => string) {
  const shop = await getStorefrontShop(shopSlug);
  if (!shop) notFound();
  const shopper = await getShopper(shop.id);
  if (!shopper) redirect(routes.storefrontSignIn(shop.slug, path(shop.slug)));
  return { shop, shopper };
}
