import { TruckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { SimplePagination } from "@/components/shared/simple-pagination";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { DeliveriesTable } from "@/features/orders/components/deliveries-table";
import { DELIVERY_VIEW_IDS, DELIVERY_VIEWS } from "@/features/orders/deliveries";
import { countDeliveries, listDeliveries } from "@/features/orders/queries";
import {
  loadDeliveryListParams,
  serializeDeliveryListParams,
} from "@/features/orders/search-params";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { listShops } from "@/features/shops/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Deliveries" };

type Props = PageProps<"/app/[orgSlug]/deliveries">;

export default function DeliveriesPage({ params, searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <>
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-10 w-full max-w-2xl" />
          <Skeleton className="h-96 rounded-xl" />
        </>
      }
    >
      <DeliveriesContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function DeliveriesContent({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const filters = await loadDeliveryListParams(searchParams);
  const { organization, role } = await requireMembership(orgSlug);
  const shops = await listShops(organization.id);
  const shop = shops.find((s) => s.slug === filters.shop) ?? null;
  const view = DELIVERY_VIEWS[filters.view];

  const [result, counts] = await Promise.all([
    listDeliveries(organization.id, view.statuses, shop?.id ?? null, filters.page),
    countDeliveries(
      organization.id,
      Object.fromEntries(DELIVERY_VIEW_IDS.map((id) => [id, DELIVERY_VIEWS[id].statuses])),
      shop?.id ?? null,
    ),
  ]);

  return (
    <>
      <PageHeader
        title="Deliveries"
        description="Every parcel from packing to the customer's door. Deliveries are confirmed with the customer's code."
      />
      <nav aria-label="Delivery stages" className="flex gap-1 overflow-x-auto border-b">
        {DELIVERY_VIEW_IDS.map((id) => {
          const active = id === filters.view;
          return (
            <Link
              key={id}
              href={
                routes.orgDeliveries(orgSlug) +
                serializeDeliveryListParams({ view: id, shop: filters.shop })
              }
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
                active
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {DELIVERY_VIEWS[id].label}
              <Badge
                variant={active ? "default" : "secondary"}
                className="h-5 min-w-5 px-1.5 tabular-nums"
              >
                {counts[id] ?? 0}
              </Badge>
            </Link>
          );
        })}
      </nav>
      {result.items.length > 0 ? (
        <>
          <DeliveriesTable
            organizationSlug={orgSlug}
            rows={result.items}
            shopNames={Object.fromEntries(shops.map((s) => [s.id, s.name]))}
            canManage={can(role, "orders.manage")}
          />
          <SimplePagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            noun={result.total === 1 ? "shipment" : "shipments"}
            hrefFor={(page) =>
              routes.orgDeliveries(orgSlug) + serializeDeliveryListParams({ ...filters, page })
            }
          />
        </>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TruckIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing here</EmptyTitle>
            <EmptyDescription>
              No shipments are {view.label.toLowerCase()} right now.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </>
  );
}
