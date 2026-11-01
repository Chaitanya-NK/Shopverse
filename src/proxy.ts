import { type NextRequest, NextResponse } from "next/server";

import { AUTH_PAGES, PROTECTED_PREFIXES, routes, safeReturnTo } from "@/config/routes";
import { env } from "@/env";
import { CUSTOM_DOMAIN_SHOP_HEADER } from "@/features/domains/constants";
import { customDomainPath, isPlatformHost, requestHost } from "@/lib/domains/hosts";
import { checkRateLimit, clientAddress } from "@/lib/rate-limit";
import { shopSlugForHost } from "@/lib/domains/resolve";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Runs before every matched request:
 *  - tags it with a request id (in logs, error reports and the response)
 *  - applies rate limits per client address
 *  - refreshes the Supabase session cookie
 *  - optimistic redirects (signed-out users away from the app, signed-in users
 *    away from auth pages)
 * This is a UX convenience only. Real authorization happens in the Data Access
 * Layer and in Postgres Row Level Security.
 */
export async function proxy(request: NextRequest) {
  const requestId = request.headers.get("x-request-id")?.slice(0, 100) || crypto.randomUUID();
  request.headers.set("x-request-id", requestId);

  const limited = await rateLimit(request);
  if (limited) return limited;

  const response = await route(request);
  response.headers.set("x-request-id", requestId);
  return response;
}

/** 429 when this client went over the limit for this kind of request. */
async function rateLimit(request: NextRequest): Promise<NextResponse | null> {
  const result = await checkRateLimit(
    {
      method: request.method,
      path: request.nextUrl.pathname,
      isAction: request.headers.has("next-action"),
      address: clientAddress(request.headers),
    },
    { upstashUrl: env.UPSTASH_REDIS_REST_URL, upstashToken: env.UPSTASH_REDIS_REST_TOKEN },
  );
  if (!result || result.ok) return null;
  const headers = {
    "retry-after": String(result.resetSeconds),
    "ratelimit-limit": String(result.limit),
    "ratelimit-remaining": "0",
    "ratelimit-reset": String(result.resetSeconds),
    "cache-control": "no-store",
  };
  const message = "Too many requests. Please wait a minute and try again.";
  return request.nextUrl.pathname.startsWith("/api/") || request.headers.has("next-action")
    ? NextResponse.json({ error: message }, { status: 429, headers })
    : new NextResponse(message, {
        status: 429,
        headers: { ...headers, "content-type": "text/plain; charset=utf-8" },
      });
}

async function route(request: NextRequest) {
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
