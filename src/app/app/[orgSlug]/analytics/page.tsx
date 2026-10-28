import { DownloadIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { BreakdownList } from "@/features/analytics/components/breakdown-list";
import { KpiTiles, KpiTilesSkeleton } from "@/features/analytics/components/kpi-tiles";
import { RevenueChart } from "@/features/analytics/components/revenue-chart";
import { SalesFilters } from "@/features/analytics/components/sales-filters";
import { getSalesReport } from "@/features/analytics/queries";
import { formatRange, resolveRange, todayInIndia } from "@/features/analytics/ranges";
import { averageOrderValue, change } from "@/features/analytics/schemas";
import { loadSalesParams } from "@/features/analytics/search-params";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { PAYMENT_METHOD_LABELS } from "@/features/orders/schemas";
import { listShops } from "@/features/shops/queries";
import { formatMoney, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Analytics" };

type Props = PageProps<"/app/[orgSlug]/analytics">;

export default function SalesPage({ params, searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-16 w-full max-w-xl" />
          <KpiTilesSkeleton />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      }
    >
      <Sales params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${formatNumber(n)} ${n === 1 ? one : many}`;

async function Sales({ params, searchParams }: Props) {
  const [{ orgSlug }, filters] = await Promise.all([params, loadSalesParams(searchParams)]);
  const { organization, role } = await requireMembership(orgSlug);
  if (!can(role, "analytics.read")) return null;

  const shops = await listShops(organization.id);
  const shop = shops.find((s) => s.id === filters.shop) ?? null;
  const range = resolveRange(filters.range, { from: filters.from, to: filters.to });
  const report = await getSalesReport(organization.id, range.from, range.to, shop?.id ?? null);
  const currency = shop?.currency ?? shops[0]?.currency ?? "INR";
  const money = (n: number) => formatMoney(n, currency);
  const { totals, previous } = report;
  const period = `previous ${range.days} days`;

  const exportQuery = {
    range: range.preset,
    from: range.preset === "custom" ? range.from : null,
    to: range.preset === "custom" ? range.to : null,
    shop: shop?.id,
  };
  const aov = averageOrderValue(totals.revenue, totals.orders);
  const showShops = !shop && shops.length > 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SalesFilters
          from={range.from}
          to={range.to}
          today={todayInIndia()}
          shops={shops.map((s) => ({ id: s.id, name: s.name }))}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <DownloadIcon />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>CSV for spreadsheets</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <a href={routes.orgExport(orgSlug, "orders", exportQuery)} download>
                Orders in this period
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href={routes.orgExport(orgSlug, "customers")} download>
                All customers
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={routes.orgExport(orgSlug, "stock")} download>
                Stock on hand
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="text-sm text-muted-foreground">
        {formatRange(range.from, range.to)}
        {shop ? ` · ${shop.name}` : shops.length > 1 ? " · all shops" : ""}. Compared with{" "}
        {formatRange(report.previousFrom, report.previousTo)}. Cancelled orders and unpaid online
        orders aren&apos;t counted.
      </p>

      <KpiTiles
        period={period}
        kpis={[
          {
            label: "Sales",
            value: money(totals.revenue),
            change: change(totals.revenue, previous.revenue),
            hint: "What customers paid, GST and delivery included",
          },
          {
            label: "Orders",
            value: formatNumber(totals.orders),
            change: change(totals.orders, previous.orders),
            hint: `${plural(totals.items, "item")} sold`,
          },
          {
            label: "Average order",
            value: money(aov),
            change: change(aov, averageOrderValue(previous.revenue, previous.orders)),
            hint: "Sales ÷ orders",
          },
          {
            label: "Customers",
            value: formatNumber(totals.customers),
            change: change(totals.customers, previous.customers),
            hint: `${formatNumber(totals.newCustomers)} ordering for the first time`,
          },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Sales by day</CardTitle>
          <CardDescription>India time. Hover a day for its orders.</CardDescription>
        </CardHeader>
        <CardContent>
          <RevenueChart data={report.byDay} currency={currency} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Top products</CardTitle>
            <CardDescription>By sales after discounts</CardDescription>
          </CardHeader>
          <CardContent>
            <BreakdownList
              label="Top products"
              empty="No products sold in this period."
              rows={report.topProducts.map((p) => ({
                key: p.key,
                label: p.title,
                value: p.revenue,
                display: money(p.revenue),
                detail: `${formatNumber(p.quantity)} sold`,
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Where the money went</CardTitle>
            <CardDescription>From item prices to what customers paid</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {[
                ["Items at list price", money(totals.gross)],
                ["Discounts", totals.discounts > 0 ? `−${money(totals.discounts)}` : money(0)],
                ["Delivery charges", money(totals.shipping)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-mono tabular-nums">{value}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 border-t pt-2 font-medium">
                <dt>Sales</dt>
                <dd className="font-mono tabular-nums">{money(totals.revenue)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">GST included in sales</dt>
                <dd className="font-mono tabular-nums">{money(totals.tax)}</dd>
              </div>
            </dl>
            <dl className="mt-5 grid grid-cols-3 gap-3 border-t pt-4 text-center">
              {[
                ["Delivered", totals.delivered],
                ["Returned", totals.returned],
                ["Cancelled", totals.cancelled],
              ].map(([label, value]) => (
                <div key={label as string} className="space-y-0.5">
                  <dd className="font-mono text-lg tabular-nums">
                    {formatNumber(value as number)}
                  </dd>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className={showShops ? "grid gap-6 lg:grid-cols-3" : "grid gap-6 lg:grid-cols-2"}>
        <Card>
          <CardHeader>
            <CardTitle>How customers paid</CardTitle>
            <CardDescription>
              {plural(totals.onlineOrders, "order")} paid online, {formatNumber(totals.codOrders)}{" "}
              cash on delivery
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BreakdownList
              label="Payment methods"
              empty="No orders in this period."
              rows={report.byPayment.map((p) => ({
                key: p.method,
                label:
                  PAYMENT_METHOD_LABELS[p.method as keyof typeof PAYMENT_METHOD_LABELS] ??
                  "Not recorded",
                value: p.revenue,
                display: money(p.revenue),
                detail: plural(p.orders, "order"),
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top states</CardTitle>
            <CardDescription>By delivery address</CardDescription>
          </CardHeader>
          <CardContent>
            <BreakdownList
              label="Top states"
              empty="No orders in this period."
              rows={report.byState.map((s) => ({
                key: s.state,
                label: s.state,
                value: s.revenue,
                display: money(s.revenue),
                detail: plural(s.orders, "order"),
              }))}
            />
          </CardContent>
        </Card>
        {showShops && (
          <Card>
            <CardHeader>
              <CardTitle>Shops</CardTitle>
              <CardDescription>Sales by storefront</CardDescription>
            </CardHeader>
            <CardContent>
              <BreakdownList
                label="Sales by shop"
                empty="No orders in this period."
                rows={report.byShop.map((s) => ({
                  key: s.shop,
                  label: s.shop,
                  value: s.revenue,
                  display: money(s.revenue),
                  detail: plural(s.orders, "order"),
                }))}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
