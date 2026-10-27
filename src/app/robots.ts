import type { MetadataRoute } from "next";

import { env } from "@/env";
import { routes } from "@/config/routes";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Storefronts are public; the admin app, accounts, carts, checkouts and order
 * pages are not for search engines. Each live shop's sitemap is listed.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  let shops: { slug: string }[] = [];
  try {
    const { data } = await createAdminClient()
      .from("shops")
      .select("slug")
      .eq("status", "live")
      .order("created_at")
      .limit(1000);
    shops = data ?? [];
  } catch {
    // Without the server key there's simply no sitemap list.
  }
  return {
    rules: {
      userAgent: "*",
      allow: ["/s/", "/track/"],
      disallow: [
        "/app",
        "/onboarding",
        "/invite",
        "/auth",
        "/s/*/account",
        "/s/*/cart",
        "/s/*/checkout",
        "/s/*/orders",
      ],
    },
    sitemap: shops.map((s) =>
      new URL(routes.storefrontSitemap(s.slug), env.NEXT_PUBLIC_APP_URL).toString(),
    ),
  };
}
