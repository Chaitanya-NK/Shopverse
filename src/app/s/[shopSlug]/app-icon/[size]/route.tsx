import { brandImageUrl } from "@/features/branding/schemas";
import { appIcon, ICON_SIZES, type IconSize } from "@/features/branding/icons";
import { getStorefrontShop } from "@/features/storefront/queries";

/** The shop's app icon (home screen, install prompt, browser tab). */
export async function GET(_request: Request, ctx: RouteContext<"/s/[shopSlug]/app-icon/[size]">) {
  const { shopSlug, size } = await ctx.params;
  const px = Number(size);
  if (!(ICON_SIZES as readonly number[]).includes(px))
    return new Response("Not found", { status: 404 });
  const shop = await getStorefrontShop(shopSlug);
  if (!shop) return new Response("Not found", { status: 404 });
  return appIcon({
    name: shop.name,
    color: shop.branding.color,
    logoUrl: shop.branding.logo ? brandImageUrl(shop.branding.logo.path, "logo", "large") : null,
    size: px as IconSize,
  });
}
