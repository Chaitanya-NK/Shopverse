import { BadgeCheckIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
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
import { CustomersSearch } from "@/features/customers/components/customers-search";
import { listCustomers } from "@/features/customers/queries";
import {
  loadCustomerListParams,
  serializeCustomerListParams,
} from "@/features/customers/search-params";
import { requireMembership } from "@/features/organizations/queries";
import { listShops } from "@/features/shops/queries";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Customers" };

type Props = PageProps<"/app/[orgSlug]/customers">;

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export default function CustomersPage({ params, searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <>
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-96 rounded-xl" />
        </>
      }
    >
      <Customers params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Customers({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const filters = await loadCustomerListParams(searchParams);
  const { organization } = await requireMembership(orgSlug);
  const [result, shops] = await Promise.all([
    listCustomers(organization.id, filters),
    listShops(organization.id),
  ]);
  const currency = shops[0]?.currency ?? "INR";

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone who has ordered, online or through your team."
      />
      <CustomersSearch />
      {result.items.length > 0 ? (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="pl-4">Customer</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                  <TableHead className="hidden pr-4 text-right sm:table-cell">Last order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((c) => (
                  <TableRow key={c.id} className="relative">
                    <TableCell className="pl-4">
                      <Link
                        href={routes.orgCustomer(orgSlug, c.id)}
                        className="font-medium after:absolute after:inset-0 hover:underline"
                      >
                        {c.name ?? c.email ?? c.phone}
                      </Link>
                      {c.lastSignInAt && (
                        <Badge variant="secondary" className="ml-2 align-middle">
                          Account
                        </Badge>
                      )}
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {[c.email, c.phone].filter(Boolean).join(" · ")}
                        {c.verified && (
                          <BadgeCheckIcon
                            className="size-3.5 text-emerald-600"
                            aria-label="Verified email"
                          />
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.ordersCount}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(c.totalSpent, currency)}
                    </TableCell>
                    <TableCell className="hidden pr-4 text-right text-muted-foreground sm:table-cell">
                      {c.lastOrderAt ? dateFormat.format(new Date(c.lastOrderAt)) : "—"}
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
            noun={result.total === 1 ? "customer" : "customers"}
            hrefFor={(page) =>
              routes.orgCustomers(orgSlug) + serializeCustomerListParams({ ...filters, page })
            }
          />
        </>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle>{filters.q ? "No matching customers" : "No customers yet"}</EmptyTitle>
            <EmptyDescription>
              {filters.q
                ? "Try another name, email or phone."
                : "Customers appear here after their first order."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </>
  );
}
