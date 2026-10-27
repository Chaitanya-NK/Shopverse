/** Policy pages a shop can publish (text lives in shops.settings.policy_<page>). */
export const STOREFRONT_POLICIES = {
  shipping: "Shipping policy",
  returns: "Returns & refunds",
  privacy: "Privacy policy",
  terms: "Terms of service",
} as const;
export type StorefrontPolicy = keyof typeof STOREFRONT_POLICIES;

export function isStorefrontPolicy(value: string): value is StorefrontPolicy {
  return Object.hasOwn(STOREFRONT_POLICIES, value);
}

/** Plain text -> paragraphs (blank lines separate them; single newlines are kept). */
export function toParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
