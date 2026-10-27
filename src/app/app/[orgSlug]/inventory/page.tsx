import { addDays, format } from "date-fns";
import {
  AlertTriangleIcon,
  ArrowLeftRightIcon,
  BoxesIcon,
  CalendarClockIcon,
  PlusIcon,
} from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { SimplePagination } from "@/components/shared/simple-pagination";
import { StatGrid, StatGridSkeleton } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { InventoryFilters } from "@/features/inventory/components/inventory-filters";
import { InventoryTable } from "@/features/inventory/components/inventory-table";
import { StockDialog } from "@/features/inventory/components/stock-dialog";
import { getInventorySummary, listInventory } from "@/features/inventory/queries";
import {
  loadInventoryListParams,
  serializeInventoryListParams,
} from "@/features/inventory/search-params";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { listWarehouses } from "@/features/warehouses/queries";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Inventory" };

type Props = PageProps<"/app/[orgSlug]/inventory">;

const EXPIRY_WINDOW_DAYS = 30;

export default function InventoryPage({ params, searchParams }: Props) {
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
      <InventoryContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function InventoryContent({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const filters = await loadInventoryListParams(searchParams);
  const { organization, role } = await requireMembership(orgSlug);

  await connection(); // "today" must be computed per request
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  const soon = format(addDays(now, EXPIRY_WINDOW_DAYS), "yyyy-MM-dd");

  const [result, summary, warehouses] = await Promise.all([
    listInventory(organization.id, filters),
    getInventorySummary(organization.id, today, soon),
    listWarehouses(organization.id),
  ]);

  const canAdjust = can(role, "inventory.adjust");
  const warehouseOptions = warehouses.map((w) => ({
    id: w.id,
    name: w.name,
    isActive: w.isActive,
  }));
  const filtered = Boolean(filters.q || filters.warehouse || filters.low);

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock by product and warehouse. Serials and batches are tracked where the category needs it."
        actions={
          canAdjust && (
            <>
              <StockDialog
                organizationSlug={orgSlug}
                operation="transfer"
                warehouses={warehouseOptions}
                trigger={
                  <Button variant="outline" disabled={warehouses.length < 2}>
                    <ArrowLeftRightIcon />
                    Transfer
                  </Button>
                }
              />
              <StockDialog
                organizationSlug={orgSlug}
                operation="receive"
                warehouses={warehouseOptions}
                trigger={
                  <Button>
                    <PlusIcon />
                    Receive stock
                  </Button>
                }
              />
            </>
          )
        }
      />

      <StatGrid
        columns={3}
        stats={[
          {
            label: "Units on hand",
            value: formatNumber(summary.unitsOnHand),
            hint: `Across ${warehouses.length} warehouse${warehouses.length === 1 ? "" : "s"}`,
            icon: BoxesIcon,
          },
          {
            label: "Low stock",
            value: formatNumber(summary.lowStock),
            hint: "Locations at or below their reorder point",
            icon: AlertTriangleIcon,
            tone: summary.lowStock > 0 ? "warning" : undefined,
          },
          {
            label: "Batches expiring soon",
            value: formatNumber(summary.expiringBatches),
            hint: `Within ${EXPIRY_WINDOW_DAYS} days`,
            icon: CalendarClockIcon,
            tone: summary.expiringBatches > 0 ? "danger" : undefined,
          },
        ]}
      />

      <InventoryFilters warehouses={warehouseOptions} />

      {result.items.length > 0 ? (
        <>
          <InventoryTable
            organizationSlug={orgSlug}
            rows={result.items}
            warehouses={warehouseOptions}
            canAdjust={canAdjust}
            canSetReorder={can(role, "warehouses.manage")}
            expirySoon={soon}
          />
          <SimplePagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            noun={result.total === 1 ? "stock location" : "stock locations"}
            hrefFor={(page) =>
              routes.orgInventory(orgSlug) + serializeInventoryListParams({ ...filters, page })
            }
          />
        </>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BoxesIcon />
            </EmptyMedia>
            <EmptyTitle>{filtered ? "Nothing matches" : "No stock yet"}</EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Try a different search, warehouse or turn off “Low stock only”."
                : "Receive stock to start tracking it. Serial-tracked products ask for each IMEI; batch-tracked ones ask for the lot and expiry."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </>
  );
}
