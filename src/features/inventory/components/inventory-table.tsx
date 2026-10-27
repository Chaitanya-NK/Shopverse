import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { routes } from "@/config/routes";
import { TrackingBadge } from "@/features/catalog/components/tracking-badge";
import { InventoryRowActions } from "@/features/inventory/components/inventory-row-actions";
import { ReorderPointEditor } from "@/features/inventory/components/reorder-point-editor";
import { type WarehouseOption } from "@/features/inventory/components/stock-dialog";
import { type InventoryRow } from "@/features/inventory/queries";
import { formatNumber } from "@/lib/format";

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

type InventoryTableProps = {
  organizationSlug: string;
  rows: InventoryRow[];
  warehouses: WarehouseOption[];
  canAdjust: boolean;
  canSetReorder: boolean;
  /** ISO date; batches expiring on or before it are highlighted. */
  expirySoon: string;
};

export function InventoryTable({
  organizationSlug,
  rows,
  warehouses,
  canAdjust,
  canSetReorder,
  expirySoon,
}: InventoryTableProps) {
  const showExpiry = rows.some((r) => r.tracking === "batch");

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="pl-4">Product</TableHead>
            <TableHead>Warehouse</TableHead>
            <TableHead className="text-right">On hand</TableHead>
            <TableHead className="hidden text-right md:table-cell">Reserved</TableHead>
            <TableHead className="text-right">Available</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Reorder at</TableHead>
            {showExpiry && <TableHead className="hidden lg:table-cell">Next expiry</TableHead>}
            <TableHead className="w-12 pr-4">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const label =
              row.variantTitle === "Default"
                ? row.productTitle
                : `${row.productTitle} · ${row.variantTitle}`;
            return (
              <TableRow key={`${row.variantId}-${row.warehouseId}`}>
                <TableCell className="max-w-72 pl-4">
                  <Link
                    href={routes.orgProduct(organizationSlug, row.productId)}
                    className="block truncate font-medium hover:underline"
                  >
                    {row.productTitle}
                  </Link>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">
                      {row.variantTitle !== "Default" && `${row.variantTitle} · `}
                      <span className="font-mono">{row.sku}</span>
                    </span>
                    <span className="hidden xl:inline-flex">
                      <TrackingBadge tracking={row.tracking} />
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  <span className="hidden sm:inline">{row.warehouseName}</span>
                  <span className="font-mono text-xs sm:hidden">{row.warehouseCode}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(row.onHand)}
                </TableCell>
                <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">
                  {formatNumber(row.reserved)}
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-medium tabular-nums">{formatNumber(row.available)}</span>
                  {row.isLow && (
                    <Badge
                      variant="secondary"
                      className="ml-2 border-transparent bg-warning text-warning-foreground"
                    >
                      Low
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="hidden text-right sm:table-cell">
                  <ReorderPointEditor
                    organizationSlug={organizationSlug}
                    variantId={row.variantId}
                    warehouseId={row.warehouseId}
                    value={row.reorderPoint}
                    label={`${label} in ${row.warehouseName}`}
                    canEdit={canSetReorder}
                  />
                </TableCell>
                {showExpiry && (
                  <TableCell className="hidden lg:table-cell">
                    {row.nextExpiry ? (
                      <span
                        className={
                          row.nextExpiry <= expirySoon ? "font-medium text-destructive" : undefined
                        }
                      >
                        {dateFormat.format(new Date(row.nextExpiry))}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
                <TableCell className="pr-4 text-right">
                  <InventoryRowActions
                    organizationSlug={organizationSlug}
                    row={row}
                    warehouses={warehouses}
                    canAdjust={canAdjust}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
