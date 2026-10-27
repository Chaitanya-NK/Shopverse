"use client";

import { PlusIcon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { searchSellableVariants, type SellableVariant } from "@/features/orders/actions";
import { formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type SellablePickerProps = {
  organizationSlug: string;
  shopId: string;
  currency: string;
  excludeIds: ReadonlySet<string>;
  onSelect: (variant: SellableVariant) => void;
};

/** "Add product" search: price and stock in the shop's warehouses. */
export function SellablePicker({
  organizationSlug,
  shopId,
  currency,
  excludeIds,
  onSelect,
}: SellablePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SellableVariant[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !shopId) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await searchSellableVariants({ organizationSlug, shopId, query });
        if (!cancelled && result.ok) setResults(result.data);
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, organizationSlug, shopId]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={!shopId}>
          <PlusIcon />
          Add product
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by name or SKU…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {isPending && results.length === 0 ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : (
              <CommandEmpty>No active products found.</CommandEmpty>
            )}
            <CommandGroup>
              {results.map((v) => {
                const added = excludeIds.has(v.id);
                return (
                  <CommandItem
                    key={v.id}
                    value={v.id}
                    disabled={added}
                    onSelect={() => {
                      onSelect(v);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate">
                        {v.productTitle}
                        {v.title !== "Default" && (
                          <span className="text-muted-foreground"> · {v.title}</span>
                        )}
                      </span>
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {v.sku}
                      </span>
                    </span>
                    <span className="grid text-right text-xs">
                      <span className="font-medium tabular-nums">
                        {formatMoney(v.price, currency)}
                      </span>
                      <span
                        className={cn(
                          "tabular-nums",
                          v.available === 0 ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {added ? "Added" : `${formatNumber(v.available)} in stock`}
                      </span>
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
