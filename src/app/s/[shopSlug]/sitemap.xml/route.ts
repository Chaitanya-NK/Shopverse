import { env } from "@/env";
import { routes } from "@/config/routes";
import { escapeHtml } from "@/lib/html";
import { getSitemapProducts, getStorefrontShop } from "@/features/storefront/queries";

/** A live shop's sitemap: home, contact, policy pages and every product. */
export async function GET(_request: Request, ctx: RouteContext<"/s/[shopSlug]/sitemap.xml">) {
  const { shopSlug } = await ctx.params;
  const shop = await getStorefrontShop(shopSlug);
  if (!shop || !shop.live) return new Response("Not found", { status: 404 });

  const products = await getSitemapProducts(shop.id);
  const abs = (path: string) => new URL(path, env.NEXT_PUBLIC_APP_URL).toString();
  const entries = [
    { loc: abs(routes.storefront(shop.slug)), lastmod: products[0]?.updated_at },
    { loc: abs(routes.storefrontContact(shop.slug)) },
    ...shop.policies.map((p) => ({ loc: abs(routes.storefrontPolicy(shop.slug, p)) })),
    ...products.map((p) => ({
      loc: abs(routes.storefrontProduct(shop.slug, p.slug)),
      lastmod: p.updated_at,
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) =>
      `  <url><loc>${escapeHtml(e.loc)}</loc>${e.lastmod ? `<lastmod>${new Date(e.lastmod).toISOString()}</lastmod>` : ""}</url>`,
  )
  .join("\n")}
</urlset>`;
  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
