import { BanknoteIcon, ClockIcon, PackageIcon, PlusIcon, ShoppingCartIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { SimplePagination } from "@/components/shared/simple-pagination";
import { StatGrid, StatGridSkeleton } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { OrdersFilters } from "@/features/orders/components/orders-filters";
import { OrdersTable } from "@/features/orders/components/orders-table";
import { getOrderCounts, listOrders } from "@/features/orders/queries";
import { loadOrderListParams, serializeOrderListParams } from "@/features/orders/search-params";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { listShops } from "@/features/shops/queries";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Orders" };

type Props = PageProps<"/app/[orgSlug]/orders">;

export default function OrdersPage({ params, searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <>
          <Skeleton className="h-12 w-72" />
          <StatGridSkeleton count={3} columns={3} />
          <Skeleton className="h-96 rounded-xl" />
        </>
      }
    >
      <OrdersContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function OrdersContent({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const filters = await loadOrderListParams(searchParams);
  const { organization, role } = await requireMembership(orgSlug);
  const shops = await listShops(organization.id);
  const shop = shops.find((s) => s.slug === filters.shop) ?? null;

  const [result, counts] = await Promise.all([
    listOrders(organization.id, { ...filters, shopId: shop?.id ?? null }),
    getOrderCounts(organization.id, shop?.id ?? null),
  ]);
  const canCreate = can(role, "orders.manage");
  const filtered = Boolean(filters.q || filters.status || filters.payment || filters.fulfillment);

  const newButton = canCreate && (
    <Button asChild>
      <Link href={routes.orgNewOrder(orgSlug) + (shop ? `?shop=${shop.slug}` : "")}>
        <PlusIcon />
        New order
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Orders"
        description={shop ? `Orders placed in ${shop.name}.` : "Orders across all your shops."}
        actions={newButton}
      />
      <StatGrid
        columns={3}
        stats={[
          {
            label: "To ship",
            value: formatNumber(counts.toShip),
            hint: "Confirmed, not fully shipped",
            icon: PackageIcon,
          },
          {
            label: "Awaiting confirmation",
            value: formatNumber(counts.pending),
            hint: "Pending orders reserve no stock",
            icon: ClockIcon,
            tone: counts.pending > 0 ? "warning" : undefined,
          },
          {
            label: "Cash to collect",
            value: formatNumber(counts.codToCollect),
            hint: "Open cash-on-delivery orders",
            icon: BanknoteIcon,
          },
        ]}
      />
      <OrdersFilters />
      {result.items.length > 0 ? (
        <>
          <OrdersTable
            organizationSlug={orgSlug}
            orders={result.items}
            showShop={!shop && shops.length > 1}
          />
          <SimplePagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            noun={result.total === 1 ? "order" : "orders"}
            hrefFor={(page) =>
              routes.orgOrders(orgSlug) + serializeOrderListParams({ ...filters, page })
            }
          />
        </>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShoppingCartIcon />
            </EmptyMedia>
            <EmptyTitle>{filtered ? "No matching orders" : "No orders yet"}</EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Try a different search or clear the filters."
                : "Orders from your storefronts will appear here. You can also enter phone, WhatsApp or counter orders yourself."}
            </EmptyDescription>
          </EmptyHeader>
          {!filtered && newButton && <EmptyContent>{newButton}</EmptyContent>}
        </Empty>
      )}
    </>
  );
}
