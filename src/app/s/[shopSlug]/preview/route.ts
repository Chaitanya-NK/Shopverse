import { type NextRequest, NextResponse } from "next/server";

import { routes } from "@/config/routes";
import { DESIGN_PREVIEW_COOKIE, DESIGN_PREVIEW_MAX_AGE } from "@/features/design/preview";
import { getStorefrontShop } from "@/features/storefront/queries";

/**
 * Turns design preview on (or off, with ?exit=1) for this browser and goes
 * to a page of the shop. The cookie alone reveals nothing: drafts are only
 * returned to signed-in staff of the shop.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/s/[shopSlug]/preview">) {
  const { shopSlug } = await params;
  const shop = await getStorefrontShop(shopSlug);
  if (!shop) return new NextResponse("Not found", { status: 404 });

  const home = routes.storefront(shop.slug);
  const to = request.nextUrl.searchParams.get("to") ?? home;
  // Only pages of this shop.
  const target =
    !/\.\.|\\|\/\//.test(to) &&
    (to === home || to.startsWith(`${home}/`) || to.startsWith(`${home}?`))
      ? to
      : home;
  const exit = request.nextUrl.searchParams.has("exit");

  const current = (request.cookies.get(DESIGN_PREVIEW_COOKIE)?.value ?? "")
    .split(",")
    .filter((id) => /^[0-9a-f-]{36}$/.test(id) && id !== shop.id);
  const next = exit ? current : [...current.slice(-4), shop.id];

  const response = NextResponse.redirect(new URL(exit ? home : target, request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  if (next.length === 0) response.cookies.delete(DESIGN_PREVIEW_COOKIE);
  else
    response.cookies.set(DESIGN_PREVIEW_COOKIE, next.join(","), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      maxAge: DESIGN_PREVIEW_MAX_AGE,
    });
  return response;
}
