/**
 * Single source of truth for URLs. Never hard-code paths in components.
 */
export const routes = {
  home: "/",
  signIn: (returnTo?: string) => withReturnTo("/sign-in", returnTo),
  signUp: (returnTo?: string) => withReturnTo("/sign-up", returnTo),
  verify: (returnTo?: string) => withReturnTo("/verify", returnTo),
  onboarding: "/onboarding",
  app: "/app",
  org: (orgSlug: string) => `/app/${orgSlug}`,
  orgShops: (orgSlug: string) => `/app/${orgSlug}/shops`,
  orgWarehouses: (orgSlug: string) => `/app/${orgSlug}/warehouses`,
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
