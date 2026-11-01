import { AlertTriangleIcon, ClipboardListIcon, PlusIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { SimplePagination } from "@/components/shared/simple-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
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
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { PurchaseOrderStatusBadge } from "@/features/purchasing/components/po-status-badge";
import {
  countOpenPurchaseOrders,
  getReorderSuggestions,
  listPurchaseOrders,
  type ReorderSuggestion,
} from "@/features/purchasing/queries";
import { PO_VIEW_IDS, PO_VIEWS } from "@/features/purchasing/schemas";
import {
  loadPurchaseOrderListParams,
  serializePurchaseOrderListParams,
} from "@/features/purchasing/search-params";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Purchasing" };

type Props = PageProps<"/app/[orgSlug]/purchasing">;

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });

export default function PurchasingPage({ params, searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <>
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-96 rounded-xl" />
        </>
      }
    >
      <Purchasing params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Purchasing({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const filters = await loadPurchaseOrderListParams(searchParams);
  const { organization, role } = await requireMembership(orgSlug);
  const canManage = can(role, "purchasing.manage");
  const [result, counts, suggestions] = await Promise.all([
    listPurchaseOrders(organization.id, filters.view, filters.page),
    countOpenPurchaseOrders(organization.id),
    canManage ? getReorderSuggestions(organization.id) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Purchasing"
        description="Order stock from suppliers and receive it into your warehouses."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={routes.orgSuppliers(orgSlug)}>
                <UsersIcon />
                Suppliers
              </Link>
            </Button>
            {canManage && (
              <Button asChild>
                <Link href={routes.orgNewPurchaseOrder(orgSlug)}>
                  <PlusIcon />
                  New purchase order
                </Link>
              </Button>
            )}
          </>
        }
      />

      {suggestions.length > 0 && <ReorderCard orgSlug={orgSlug} suggestions={suggestions} />}

      <nav aria-label="Purchase order status" className="flex gap-1 overflow-x-auto border-b">
        {PO_VIEW_IDS.map((id) => {
          const active = id === filters.view;
          return (
            <Link
              key={id}
              href={routes.orgPurchasing(orgSlug) + serializePurchaseOrderListParams({ view: id })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
                active
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {PO_VIEWS[id].label}
              <Badge
                variant={active ? "default" : "secondary"}
                className="h-5 min-w-5 px-1.5 tabular-nums"
              >
                {counts[id]}
              </Badge>
            </Link>
          );
        })}
      </nav>

      {result.items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardListIcon />
            </EmptyMedia>
            <EmptyTitle>No purchase orders here</EmptyTitle>
            <EmptyDescription>
              Create one to order stock; receive it when the delivery arrives and your stock updates
              by itself.
            </EmptyDescription>
          </EmptyHeader>
          {canManage && filters.view === "open" && (
            <EmptyContent>
              <Button asChild>
                <Link href={routes.orgNewPurchaseOrder(orgSlug)}>
                  <PlusIcon />
                  New purchase order
                </Link>
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Deliver to</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell>
                      <Link
                        href={routes.orgPurchaseOrder(orgSlug, po.id)}
                        className="font-mono font-medium hover:underline"
                      >
                        {po.number}
                      </Link>
                    </TableCell>
                    <TableCell>{po.supplierName}</TableCell>
                    <TableCell>{po.warehouseName}</TableCell>
                    <TableCell>
                      {po.expectedAt
                        ? dateFormat.format(new Date(`${po.expectedAt}T00:00:00`))
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {po.receivedQuantity} / {po.orderedQuantity}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(po.total, "INR")}
                    </TableCell>
                    <TableCell>
                      <PurchaseOrderStatusBadge status={po.status} />
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
            noun={result.total === 1 ? "purchase order" : "purchase orders"}
            hrefFor={(page) =>
              routes.orgPurchasing(orgSlug) + serializePurchaseOrderListParams({ ...filters, page })
            }
          />
        </>
      )}
    </>
  );
}

function ReorderCard({
  orgSlug,
  suggestions,
}: {
  orgSlug: string;
  suggestions: ReorderSuggestion[];
}) {
  // One draft per warehouse and last supplier.
  const groups = new Map<
    string,
    {
      warehouseId: string;
      warehouseName: string;
      supplierId: string | null;
      supplierName: string | null;
      count: number;
    }
  >();
  for (const s of suggestions.filter((s) => s.suggested > 0)) {
    const key = `${s.warehouse_id}:${s.supplier_id ?? ""}`;
    const g = groups.get(key) ?? {
      warehouseId: s.warehouse_id,
      warehouseName: s.warehouse_name,
      supplierId: s.supplier_id,
      supplierName: s.supplier_name,
      count: 0,
    };
    g.count += 1;
    groups.set(key, g);
  }
  return (
    <Card className="border-warning">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangleIcon className="size-5 text-warning-foreground" aria-hidden />
          {suggestions.length} item{suggestions.length === 1 ? " is" : "s are"} at or below the
          reorder point
        </CardTitle>
        <CardDescription>
          Suggested quantities bring stock back to twice the reorder point, less what&apos;s already
          on order.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y rounded-lg border text-sm">
          {suggestions.slice(0, 8).map((s) => (
            <li
              key={`${s.variant_id}:${s.warehouse_id}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2.5"
            >
              <span className="min-w-0 flex-1 truncate">
                {s.product_title}
                {s.variant_title !== "Default" ? ` · ${s.variant_title}` : ""}
                <span className="ml-2 font-mono text-xs text-muted-foreground">{s.sku}</span>
              </span>
              <span className="text-muted-foreground">{s.warehouse_name}</span>
              <span className="tabular-nums">
                {s.available} left (reorder at {s.reorder_point})
              </span>
              <Badge variant="outline">
                {s.on_order > 0 ? `${s.on_order} on order · ` : ""}order {s.suggested}
              </Badge>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          {[...groups.values()].map((g) => (
            <Button key={`${g.warehouseId}:${g.supplierId}`} asChild variant="outline" size="sm">
              <Link
                href={`${routes.orgNewPurchaseOrder(orgSlug)}?reorder=1&warehouse=${g.warehouseId}${g.supplierId ? `&supplier=${g.supplierId}` : ""}`}
              >
                Reorder {g.count} for {g.warehouseName}
                {g.supplierName ? ` from ${g.supplierName}` : ""}
              </Link>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
