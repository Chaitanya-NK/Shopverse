import { NextResponse } from "next/server";

import { csvFilename, toCsv } from "@/features/analytics/csv";
import { listAllNewsletterSubscribers } from "@/features/marketing/queries";
import { can } from "@/features/organizations/permissions";
import { listMyMemberships } from "@/features/organizations/queries";
import { listShops } from "@/features/shops/queries";
import { getSessionUser } from "@/lib/auth/session";

/** Every newsletter sign-up, for the business to import into its email tool. */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/app/[orgSlug]/marketing/subscribers.csv">,
) {
  const { orgSlug } = await ctx.params;
  if (!(await getSessionUser())) return new NextResponse("Sign in first", { status: 401 });
  const membership = (await listMyMemberships()).find((m) => m.organization.slug === orgSlug);
  if (!membership || !can(membership.role, "marketing.manage"))
    return new NextResponse("Not found", { status: 404 });

  const [subscribers, shops] = await Promise.all([
    listAllNewsletterSubscribers(membership.organization.id),
    listShops(membership.organization.id),
  ]);
  const shopName = new Map(shops.map((s) => [s.id, s.name]));
  const body = toCsv(
    ["Email", "Shop", "Signed up"],
    subscribers.map((s) => [s.email, shopName.get(s.shopId) ?? "", s.createdAt.slice(0, 10)]),
  );
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(orgSlug, "newsletter-subscribers")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
