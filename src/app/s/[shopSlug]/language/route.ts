import { type NextRequest, NextResponse } from "next/server";

import { routes } from "@/config/routes";
import { isLocale, LOCALE_COOKIE } from "@/i18n/core";

/** Switch the storefront's language (?to=hi) and go back to the page (?back=…). */
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/s/[shopSlug]/language">,
) {
  const { shopSlug } = await params;
  const home = routes.storefront(shopSlug);
  const to = request.nextUrl.searchParams.get("to");
  const back = request.nextUrl.searchParams.get("back") ?? home;
  // Only pages of this shop (on its own domain, the paths start at /).
  const safe = /^\/(?!\/)/.test(back) && !/\.\.|\\/.test(back) ? back : home;
  const response = NextResponse.redirect(new URL(safe, request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  if (isLocale(to))
    response.cookies.set(LOCALE_COOKIE, to, {
      path: "/",
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      maxAge: 60 * 60 * 24 * 365,
    });
  return response;
}
