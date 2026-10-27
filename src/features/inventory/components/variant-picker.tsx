"use client";

import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
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
import { searchVariants, type VariantSearchResult } from "@/features/inventory/actions";
import { TRACKING_LABELS } from "@/features/organizations/industries";
import { cn } from "@/lib/utils";

type VariantPickerProps = {
  id?: string;
  organizationSlug: string;
  value: VariantSearchResult | null;
  onChange: (variant: VariantSearchResult) => void;
  invalid?: boolean;
  disabled?: boolean;
};

/** Search products by title or SKU (server-side) and pick a variant. */
export function VariantPicker({
  id,
  organizationSlug,
  value,
  onChange,
  invalid,
  disabled,
}: VariantPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VariantSearchResult[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await searchVariants({ organizationSlug, query });
        if (!cancelled && result.ok) setResults(result.data);
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, organizationSlug]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          disabled={disabled}
          className="h-auto min-h-9 w-full justify-between py-1.5 font-normal aria-invalid:border-destructive"
        >
          {value ? (
            <span className="grid min-w-0 text-left">
              <span className="truncate">
                {value.productTitle}
                {value.variantTitle !== "Default" && (
                  <span className="text-muted-foreground"> · {value.variantTitle}</span>
                )}
              </span>
              <span className="truncate font-mono text-xs text-muted-foreground">{value.sku}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Search by product or SKU</span>
          )}
          <ChevronsUpDownIcon className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-80 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Product name or SKU…" value={query} onValueChange={setQuery} />
          <CommandList>
            {isPending && results.length === 0 ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : (
              <CommandEmpty>No products found.</CommandEmpty>
            )}
            <CommandGroup>
              {results.map((variant) => (
                <CommandItem
                  key={variant.id}
                  value={variant.id}
                  onSelect={() => {
                    onChange(variant);
                    setOpen(false);
                  }}
                >
                  <CheckIcon
                    className={cn(value?.id === variant.id ? "opacity-100" : "opacity-0")}
                  />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate">
                      {variant.productTitle}
                      {variant.variantTitle !== "Default" && (
                        <span className="text-muted-foreground"> · {variant.variantTitle}</span>
                      )}
                    </span>
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {variant.sku}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {TRACKING_LABELS[variant.tracking].label}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
