import { NextResponse } from "next/server";

import {
  customersCsv,
  EXPORTS,
  type ExportKind,
  gstCsv,
  ordersCsv,
  stockCsv,
} from "@/features/analytics/exports";
import {
  RANGE_PRESETS,
  type RangePreset,
  resolveMonth,
  resolveRange,
} from "@/features/analytics/ranges";
import { can } from "@/features/organizations/permissions";
import { listMyMemberships } from "@/features/organizations/queries";
import { getSessionUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = () => new NextResponse("Not found", { status: 404 });

/** CSV downloads for owners, admins and managers. Row-level security still applies to every row. */
export async function GET(
  request: Request,
  ctx: RouteContext<"/app/[orgSlug]/analytics/export/[report]">,
) {
  const { orgSlug, report } = await ctx.params;
  if (!(EXPORTS as readonly string[]).includes(report)) return notFound();

  if (!(await getSessionUser())) return new NextResponse("Sign in first", { status: 401 });
  const membership = (await listMyMemberships()).find((m) => m.organization.slug === orgSlug);
  if (!membership || !can(membership.role, "analytics.read")) return notFound();

  const params = new URL(request.url).searchParams;
  const shopParam = params.get("shop");
  const shopId = shopParam && UUID.test(shopParam) ? shopParam : null;
  const organizationId = membership.organization.id;
  const kind = report as ExportKind;

  try {
    let file;
    switch (kind) {
      case "orders": {
        const preset = params.get("range");
        const range = resolveRange(
          (RANGE_PRESETS as readonly string[]).includes(preset ?? "")
            ? (preset as RangePreset)
            : "30d",
          { from: params.get("from"), to: params.get("to") },
        );
        file = await ordersCsv(organizationId, range, shopId);
        break;
      }
      case "customers":
        file = await customersCsv(organizationId);
        break;
      case "stock":
        file = await stockCsv(organizationId);
        break;
      default:
        file = await gstCsv(kind, organizationId, resolveMonth(params.get("month")), shopId);
    }
    return new NextResponse(file.body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logger.error({ err: error, report, organizationId }, "CSV export failed");
    return new NextResponse("The export couldn't be prepared. Try again.", { status: 500 });
  }
}
