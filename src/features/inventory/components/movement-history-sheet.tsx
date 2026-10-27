"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { listMovements, type Movement } from "@/features/inventory/actions";
import { MOVEMENT_LABELS } from "@/features/inventory/schemas";
import { cn } from "@/lib/utils";

const timeFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

type MovementHistorySheetProps = {
  organizationSlug: string;
  variantId: string;
  warehouseId?: string;
  title: string;
  subtitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** The stock ledger for one variant (optionally one warehouse), newest first. */
export function MovementHistorySheet({
  organizationSlug,
  variantId,
  warehouseId,
  title,
  subtitle,
  open,
  onOpenChange,
}: MovementHistorySheetProps) {
  const [state, setState] = useState<{ key: string; movements: Movement[] | null; error?: string }>(
    {
      key: "",
      movements: null,
    },
  );
  const key = `${variantId}:${warehouseId ?? ""}`;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listMovements({ organizationSlug, variantId, warehouseId }).then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { key, movements: result.data }
          : { key, movements: [], error: result.error.message },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [open, organizationSlug, variantId, warehouseId, key]);

  const movements = state.key === key ? state.movements : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{subtitle}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          {movements === null ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : movements.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              {state.error ?? "No stock movements yet."}
            </p>
          ) : (
            <ol className="divide-y">
              {movements.map((m) => (
                <li key={m.id} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 px-4 py-3">
                  <span className="font-medium">{MOVEMENT_LABELS[m.type]}</span>
                  <span
                    className={cn(
                      "text-right font-semibold tabular-nums",
                      m.quantity > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-destructive",
                    )}
                  >
                    {m.quantity > 0 ? "+" : ""}
                    {m.quantity}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {timeFormat.format(new Date(m.createdAt))}
                    {!warehouseId && ` · ${m.warehouseName}`}
                  </span>
                  <span className="text-right text-xs text-muted-foreground tabular-nums">
                    balance {m.balanceAfter}
                  </span>
                  {(m.batchCode || m.serials.length > 0 || m.note) && (
                    <div className="col-span-2 flex flex-wrap items-center gap-1.5 pt-1">
                      {m.batchCode && (
                        <Badge variant="outline" className="font-mono">
                          {m.batchCode}
                        </Badge>
                      )}
                      {m.serials.slice(0, 6).map((s) => (
                        <Badge key={s} variant="secondary" className="font-mono">
                          {s}
                        </Badge>
                      ))}
                      {m.serials.length > 6 && (
                        <span className="text-xs text-muted-foreground">
                          +{m.serials.length - 6} more
                        </span>
                      )}
                      {m.note && (
                        <span className="w-full text-sm text-muted-foreground">{m.note}</span>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
