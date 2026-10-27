/**
 * Single source of truth for URLs. Never hard-code paths in components.
 */
export const routes = {
  home: "/",
  signIn: (returnTo?: string) => withReturnTo("/sign-in", returnTo),
  signUp: (returnTo?: string) => withReturnTo("/sign-up", returnTo),
  verify: (returnTo?: string) => withReturnTo("/verify", returnTo),
  /** Lands here from the link in the sign-in email (token hash or PKCE code). */
  authConfirm: "/auth/confirm",
  onboarding: "/onboarding",
  app: "/app",
  org: (orgSlug: string) => `/app/${orgSlug}`,
  orgShops: (orgSlug: string) => `/app/${orgSlug}/shops`,
  orgCategories: (orgSlug: string) => `/app/${orgSlug}/categories`,
  orgWarehouses: (orgSlug: string) => `/app/${orgSlug}/warehouses`,
  orgProducts: (orgSlug: string) => `/app/${orgSlug}/products`,
  orgNewProduct: (orgSlug: string) => `/app/${orgSlug}/products/new`,
  orgProduct: (orgSlug: string, productId: string) => `/app/${orgSlug}/products/${productId}`,
  orgInventory: (orgSlug: string) => `/app/${orgSlug}/inventory`,
  orgOrders: (orgSlug: string) => `/app/${orgSlug}/orders`,
  orgNewOrder: (orgSlug: string) => `/app/${orgSlug}/orders/new`,
  orgOrder: (orgSlug: string, orderId: string) => `/app/${orgSlug}/orders/${orderId}`,
  orgDeliveries: (orgSlug: string) => `/app/${orgSlug}/deliveries`,
  // Public storefront (no sign-in)
  storefront: (shopSlug: string) => `/s/${shopSlug}`,
  storefrontSearch: (shopSlug: string, query: string) =>
    `/s/${shopSlug}?q=${encodeURIComponent(query)}`,
  storefrontCategory: (shopSlug: string, categoryId: string) =>
    `/s/${shopSlug}?category=${categoryId}`,
  storefrontProduct: (shopSlug: string, productSlug: string) => `/s/${shopSlug}/p/${productSlug}`,
  storefrontCart: (shopSlug: string) => `/s/${shopSlug}/cart`,
  storefrontCheckout: (shopSlug: string) => `/s/${shopSlug}/checkout`,
  storefrontOrder: (shopSlug: string, token: string) => `/s/${shopSlug}/orders/${token}`,
  // Shopper accounts (separate from staff sign-in)
  storefrontSignIn: (shopSlug: string, returnTo?: string) =>
    withReturnTo(`/s/${shopSlug}/account/sign-in`, returnTo),
  storefrontAccount: (shopSlug: string) => `/s/${shopSlug}/account`,
  storefrontWishlist: (shopSlug: string) => `/s/${shopSlug}/account/wishlist`,
  storefrontAddresses: (shopSlug: string) => `/s/${shopSlug}/account/addresses`,
  storefrontProfile: (shopSlug: string) => `/s/${shopSlug}/account/profile`,
  orgCustomers: (orgSlug: string) => `/app/${orgSlug}/customers`,
  orgTeam: (orgSlug: string) => `/app/${orgSlug}/team`,
  orgAudit: (orgSlug: string) => `/app/${orgSlug}/team/audit`,
  orgBilling: (orgSlug: string) => `/app/${orgSlug}/billing`,
  /** Accept a team invitation (public; asks the visitor to sign in). */
  invitation: (token: string) => `/invite/${token}`,
  orgCustomer: (orgSlug: string, customerId: string) => `/app/${orgSlug}/customers/${customerId}`,
  /** Public, unauthenticated parcel tracking page for customers. */
  tracking: (token: string) => `/track/${token}`,
  orgSettings: (orgSlug: string) => `/app/${orgSlug}/settings`,
} as const;

/** Paths only signed-in users may visit (checked optimistically in the proxy). */
export const PROTECTED_PREFIXES = ["/app", "/onboarding"] as const;

/** Paths signed-in users are bounced away from. */
export const AUTH_PAGES = ["/sign-in", "/sign-up", "/verify"] as const;

export const RETURN_TO_PARAM = "next";

function withReturnTo(path: string, returnTo?: string) {
  return returnTo ? `${path}?${RETURN_TO_PARAM}=${encodeURIComponent(returnTo)}` : path;
}

/**
 * Only allow same-origin relative paths as post-login destinations, preventing
 * open-redirect attacks via `?next=https://evil.example`.
 */
export function safeReturnTo(value: unknown, fallback: string = routes.app): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}
