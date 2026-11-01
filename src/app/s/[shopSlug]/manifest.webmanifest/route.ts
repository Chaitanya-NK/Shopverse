import { routes } from "@/config/routes";
import { brandTheme } from "@/features/branding/theme";
import { getStorefrontShop } from "@/features/storefront/queries";

/** Lets shoppers install the shop as an app on their phone. */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/s/[shopSlug]/manifest.webmanifest">,
) {
  const { shopSlug } = await ctx.params;
  const shop = await getStorefrontShop(shopSlug);
  if (!shop || !shop.live) return new Response("Not found", { status: 404 });
  const theme = brandTheme(shop.branding.color);
  const start = routes.storefront(shop.slug);
  const manifest = {
    id: start,
    name: shop.name,
    short_name: shop.name.length > 12 ? shop.name.split(/\s+/)[0]!.slice(0, 12) : shop.name,
    description: shop.tagline ?? `Shop ${shop.name}`,
    start_url: `${start}?source=app`,
    scope: start,
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: theme.primary,
    lang: "en-IN",
    categories: ["shopping"],
    icons: [
      {
        src: routes.storefrontIcon(shop.slug, 192),
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: routes.storefrontIcon(shop.slug, 512),
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: routes.storefrontIcon(shop.slug, 512),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Cart", url: routes.storefrontCart(shop.slug) },
      { name: "My orders", url: routes.storefrontAccount(shop.slug) },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: {
      "content-type": "application/manifest+json",
      "cache-control": "public, max-age=3600",
    },
  });
}
