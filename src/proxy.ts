import { type NextRequest, NextResponse } from "next/server";

import { AUTH_PAGES, PROTECTED_PREFIXES, routes, safeReturnTo } from "@/config/routes";
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
