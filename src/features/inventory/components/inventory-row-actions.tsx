"use client";

import {
  ArrowLeftRightIcon,
  HistoryIcon,
  MinusIcon,
  MoreHorizontalIcon,
  PlusIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MovementHistorySheet } from "@/features/inventory/components/movement-history-sheet";
import {
  StockDialog,
  type StockOperation,
  type WarehouseOption,
} from "@/features/inventory/components/stock-dialog";
import { type InventoryRow } from "@/features/inventory/queries";

type InventoryRowActionsProps = {
  organizationSlug: string;
  row: InventoryRow;
  warehouses: WarehouseOption[];
  canAdjust: boolean;
};

export function InventoryRowActions({
  organizationSlug,
  row,
  warehouses,
  canAdjust,
}: InventoryRowActionsProps) {
  const [operation, setOperation] = useState<StockOperation | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const label =
    row.variantTitle === "Default" ? row.productTitle : `${row.productTitle} · ${row.variantTitle}`;

  const preset = {
    variant: {
      id: row.variantId,
      sku: row.sku,
      variantTitle: row.variantTitle,
      productTitle: row.productTitle,
      tracking: row.tracking,
    },
    warehouseId: row.warehouseId,
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Actions for ${label} in ${row.warehouseName}`}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canAdjust && (
            <>
              <DropdownMenuItem onSelect={() => setOperation("receive")}>
                <PlusIcon />
                Receive
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setOperation("remove")} disabled={row.onHand === 0}>
                <MinusIcon />
                Remove
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setOperation("transfer")}
                disabled={row.available === 0 || warehouses.length < 2}
              >
                <ArrowLeftRightIcon />
                Transfer
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
            <HistoryIcon />
            History
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {operation && (
        <StockDialog
          key={operation}
          organizationSlug={organizationSlug}
          operation={operation}
          warehouses={warehouses}
          preset={preset}
          open
          onOpenChange={(open) => !open && setOperation(null)}
        />
      )}
      <MovementHistorySheet
        organizationSlug={organizationSlug}
        variantId={row.variantId}
        warehouseId={row.warehouseId}
        title={label}
        subtitle={`${row.sku} · ${row.warehouseName}`}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </>
  );
}
