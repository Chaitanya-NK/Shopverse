import { type NextRequest, NextResponse } from "next/server";

import { AUTH_PAGES, PROTECTED_PREFIXES, routes, safeReturnTo } from "@/config/routes";
import { env } from "@/env";
import { CUSTOM_DOMAIN_SHOP_HEADER } from "@/features/domains/constants";
import { customDomainPath, isPlatformHost, requestHost } from "@/lib/domains/hosts";
import { shopSlugForHost } from "@/lib/domains/resolve";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Runs before every matched request:
 *  - refreshes the Supabase session cookie
 *  - optimistic redirects (signed-out users away from the app, signed-in users
 *    away from auth pages)
 * This is a UX convenience only. Real authorization happens in the Data Access
 * Layer and in Postgres Row Level Security.
 */
export async function proxy(request: NextRequest) {
  const host = requestHost(request.headers);
  if (
    !isPlatformHost(
      host,
      env.NEXT_PUBLIC_APP_URL,
      process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN,
    )
  ) {
    const slug = await shopSlugForHost(host);
    if (slug) return serveShopDomain(request, slug);
  }
  // Only the proxy may say a request came in on a shop's own domain.
  request.headers.delete(CUSTOM_DOMAIN_SHOP_HEADER);

  const { response, userId } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (isProtected && !userId) {
    return redirectWithCookies(request, response, routes.signIn(`${pathname}${search}`));
  }

  const isAuthPage = AUTH_PAGES.some((p) => pathname === p);
  if (isAuthPage && userId) {
    const next = safeReturnTo(request.nextUrl.searchParams.get("next"));
    return redirectWithCookies(request, response, next);
  }

  return response;
}

/**
 * A request on a shop's own domain: everything is that shop. Paths outside
 * /s/<shop> are rewritten into it, and the header tells the app to scope the
 * shop's cookies to / instead of /s/<shop>.
 */
function serveShopDomain(request: NextRequest, slug: string) {
  const headers = new Headers(request.headers);
  headers.set(CUSTOM_DOMAIN_SHOP_HEADER, slug);
  const target = customDomainPath(request.nextUrl.pathname, slug);
  if (!target) return NextResponse.next({ request: { headers } });
  const url = request.nextUrl.clone();
  url.pathname = target;
  return NextResponse.rewrite(url, { request: { headers } });
}

/** Redirect while preserving any refreshed session cookies. */
function redirectWithCookies(request: NextRequest, source: NextResponse, to: string) {
  const redirect = NextResponse.redirect(new URL(to, request.url));
  for (const cookie of source.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export const config = {
  matcher: [
    // Everything except static assets and image optimisation.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
