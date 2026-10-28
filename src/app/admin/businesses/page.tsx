import { Building2Icon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { SimplePagination } from "@/components/shared/simple-pagination";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { routes } from "@/config/routes";
import { BusinessSearch } from "@/features/admin/components/business-search";
import { PlanStatus } from "@/features/admin/components/plan-status";
import { ADMIN_FILTERS, listBusinesses } from "@/features/admin/queries";
import {
  ADMIN_FILTER_IDS,
  loadBusinessListParams,
  serializeBusinessListParams,
} from "@/features/admin/search-params";
import { formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Businesses" };

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export default function BusinessesPage({ searchParams }: PageProps<"/admin/businesses">) {
  return (
    <>
      <PageHeader title="Businesses" description="Search by name, shop handle or owner email." />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <Businesses searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Businesses({ searchParams }: Pick<PageProps<"/admin/businesses">, "searchParams">) {
  const params = await loadBusinessListParams(searchParams);
  await connection();
  const result = await listBusinesses(params.q, params.filter, params.page);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BusinessSearch />
        <nav aria-label="Filter businesses" className="flex flex-wrap gap-1">
          {ADMIN_FILTER_IDS.map((id) => (
            <Link
              key={id}
              href={
                routes.adminBusinesses +
                serializeBusinessListParams({ q: params.q || null, filter: id })
              }
              aria-current={id === params.filter ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                id === params.filter
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {ADMIN_FILTERS[id]}
            </Link>
          ))}
        </nav>
      </div>
      {result.items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Building2Icon />
            </EmptyMedia>
            <EmptyTitle>No businesses found</EmptyTitle>
            <EmptyDescription>Try another search or filter.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="pl-4">Business</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Shops</TableHead>
                  <TableHead className="text-right">Orders · 30 days</TableHead>
                  <TableHead className="pr-4 text-right">Sold · 30 days</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="pl-4">
                      <Link
                        href={routes.adminBusiness(b.id)}
                        className="font-medium hover:underline"
                      >
                        {b.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {b.owner_email ?? "No owner"} · since{" "}
                        {dateFormat.format(new Date(b.created_at))}
                      </span>
                    </TableCell>
                    <TableCell>
                      <PlanStatus b={b} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(b.shops)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(b.orders_30d)}
                    </TableCell>
                    <TableCell className="pr-4 text-right font-mono tabular-nums">
                      {formatMoney(b.gmv_30d, "INR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <SimplePagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            noun={result.total === 1 ? "business" : "businesses"}
            hrefFor={(page) =>
              routes.adminBusinesses + serializeBusinessListParams({ ...params, page })
            }
          />
        </>
      )}
    </>
  );
}
