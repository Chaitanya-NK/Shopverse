import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PLAN_NAMES, type PlanId } from "@/config/plans";
import { routes } from "@/config/routes";
import { BreakdownList } from "@/features/analytics/components/breakdown-list";
import { getAdminOverview } from "@/features/admin/queries";
import { formatMoney, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Overview" };

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
});

export default function AdminOverviewPage() {
  return (
    <>
      <PageHeader
        title="Shopverse"
        description="Every business on the platform, plans and revenue."
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <Overview />
      </Suspense>
    </>
  );
}

async function Overview() {
  const o = await getAdminOverview();
  const tiles: [string, string, string][] = [
    ["Businesses", formatNumber(o.businesses), `${formatNumber(o.new_30d)} new in 30 days`],
    [
      "Monthly recurring revenue",
      formatMoney(o.mrr, "INR"),
      `${formatNumber(o.subscriptions)} paying subscriptions, before GST`,
    ],
    ["Billed in 30 days", formatMoney(o.billed_30d, "INR"), "GST included"],
    [
      "Needs attention",
      formatNumber(o.past_due + o.trials_ending_7d),
      `${formatNumber(o.past_due)} past due · ${formatNumber(o.trials_ending_7d)} trials ending this week`,
    ],
  ];
  const plans: PlanId[] = ["trial", "starter", "growth", "scale"];
  return (
    <>
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(([label, value, hint]) => (
          <Card key={label} className="gap-2">
            <CardHeader>
              <CardDescription>
                <dt>{label}</dt>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <dd className="font-mono text-2xl font-semibold tabular-nums">{value}</dd>
              <dd className="text-xs text-muted-foreground">{hint}</dd>
            </CardContent>
          </Card>
        ))}
      </dl>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Businesses by plan</CardTitle>
            <CardDescription>
              {formatNumber(o.orders_30d)} orders and {formatMoney(o.gmv_30d, "INR")} sold across
              all shops in 30 days
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BreakdownList
              label="Businesses by plan"
              empty="No businesses yet."
              rows={plans.map((p) => ({
                key: p,
                label: PLAN_NAMES[p],
                value: o.by_plan[p] ?? 0,
                display: formatNumber(o.by_plan[p] ?? 0),
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent invoices</CardTitle>
          </CardHeader>
          <CardContent>
            {o.recent_invoices.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No payments yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="pl-3">Invoice</TableHead>
                      <TableHead>Business</TableHead>
                      <TableHead className="pr-3 text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {o.recent_invoices.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="pl-3">
                          <Link
                            href={routes.adminInvoice(i.id)}
                            className="font-mono font-medium hover:underline"
                          >
                            {i.number}
                          </Link>
                          <span className="block text-xs text-muted-foreground">
                            {dateFormat.format(new Date(i.issued_at))} · {PLAN_NAMES[i.plan]}{" "}
                            {i.interval}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={routes.adminBusiness(i.organization_id)}
                            className="hover:underline"
                          >
                            {i.organization}
                          </Link>
                        </TableCell>
                        <TableCell className="pr-3 text-right font-mono tabular-nums">
                          {formatMoney(i.total, "INR")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
