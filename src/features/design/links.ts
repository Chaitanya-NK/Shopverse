import { routes } from "@/config/routes";

/**
 * Links in a design are stored relative to the shop ("/c/sale", "/p/tee",
 * "/products?category=…", "/") or as full https addresses, so they keep
 * working if the shop's handle or domain changes.
 */
export function shopHref(shopSlug: string, link: string): string | null {
  const value = link.trim();
  if (!value) return null;
  if (/^https:\/\//.test(value)) return value;
  if (!/^\/([^/\\]|$)/.test(value)) return null;
  // Links saved before designs existed (banners) already include /s/<shop>.
  if (
    value === `/s/${shopSlug}` ||
    value.startsWith(`/s/${shopSlug}/`) ||
    value.startsWith(`/s/${shopSlug}?`)
  )
    return value;
  return value === "/" ? routes.storefront(shopSlug) : `${routes.storefront(shopSlug)}${value}`;
}

export function isExternal(href: string): boolean {
  return href.startsWith("https://");
}

/** Shop-relative links for the editor's link picker. */
export const shopLinks = {
  home: "/",
  products: "/products",
  contact: "/contact",
  cart: "/cart",
  collection: (slug: string) => `/c/${slug}`,
  category: (id: string) => `/products?category=${id}`,
  product: (slug: string) => `/p/${slug}`,
  page: (handle: string) => `/pages/${handle}`,
};
