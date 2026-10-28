import { NextResponse } from "next/server";

import { csvFilename } from "@/features/analytics/csv";
import { can } from "@/features/organizations/permissions";
import { listMyMemberships } from "@/features/organizations/queries";
import { productCsvHeaders } from "@/features/products/csv-import";
import { loadImportCategories, productsCsv } from "@/features/products/csv-server";
import { getSessionUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/features/analytics/csv";

/** All products as CSV (or ?template=1 for an empty file with the right columns). */
export async function GET(request: Request, ctx: RouteContext<"/app/[orgSlug]/products/export">) {
  const { orgSlug } = await ctx.params;
  if (!(await getSessionUser())) return new NextResponse("Sign in first", { status: 401 });
  const membership = (await listMyMemberships()).find((m) => m.organization.slug === orgSlug);
  if (!membership || !can(membership.role, "catalog.manage"))
    return new NextResponse("Not found", { status: 404 });

  const template = new URL(request.url).searchParams.get("template") === "1";
  try {
    const supabase = await createClient();
    const organizationId = membership.organization.id;
    const body = template
      ? toCsv(productCsvHeaders(await loadImportCategories(supabase, organizationId)), [])
      : await productsCsv(supabase, organizationId);
    const name = csvFilename(orgSlug, template ? "product-template" : "products");
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    logger.error({ err: error, orgSlug }, "products export failed");
    return new NextResponse("Couldn't build the export. Try again.", { status: 500 });
  }
}
