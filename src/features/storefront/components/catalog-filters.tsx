"use client";

import { SlidersHorizontalIcon, XIcon } from "lucide-react";
import { useQueryStates } from "nuqs";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { catalogParams } from "@/features/storefront/search-params";
import { formatMoney } from "@/lib/format";

const toNumber = (v: string) => {
  const n = Number(v.replace(/[,\s₹]/g, ""));
  return v.trim() === "" || !Number.isFinite(n) || n < 0 ? null : Math.round(n);
};

/** Price range and "in stock only", kept in the URL so results can be shared. */
export function CatalogFilters({
  currency,
  priceRange,
}: {
  currency: string;
  priceRange: { min: number | null; max: number | null };
}) {
  const [isPending, startTransition] = useTransition();
  const [params, setParams] = useQueryStates(catalogParams, { shallow: false, startTransition });
  const [open, setOpen] = useState(false);
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [stock, setStock] = useState(false);
  const active =
    (params.min !== null ? 1 : 0) + (params.max !== null ? 1 : 0) + (params.stock ? 1 : 0);

  const apply = () => {
    let lo = toNumber(min);
    let hi = toNumber(max);
    if (lo !== null && hi !== null && lo > hi) [lo, hi] = [hi, lo];
    void setParams({ min: lo, max: hi, stock: stock || null, page: null });
    setOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-pending={isPending || undefined}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          // Start from what's applied each time it opens.
          if (next) {
            setMin(params.min !== null ? String(params.min) : "");
            setMax(params.max !== null ? String(params.max) : "");
            setStock(params.stock);
          }
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="outline">
            <SlidersHorizontalIcon />
            Filters
            {active > 0 && (
              <Badge className="h-5 min-w-5 rounded-full px-1 tabular-nums">{active}</Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              apply();
            }}
          >
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Price</legend>
              <div className="grid grid-cols-2 gap-2">
                <Field>
                  <FieldLabel htmlFor="filter-min" className="text-xs text-muted-foreground">
                    Min
                  </FieldLabel>
                  <Input
                    id="filter-min"
                    inputMode="numeric"
                    value={min}
                    onChange={(e) => setMin(e.target.value)}
                    placeholder={priceRange.min !== null ? String(Math.floor(priceRange.min)) : "0"}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="filter-max" className="text-xs text-muted-foreground">
                    Max
                  </FieldLabel>
                  <Input
                    id="filter-max"
                    inputMode="numeric"
                    value={max}
                    onChange={(e) => setMax(e.target.value)}
                    placeholder={
                      priceRange.max !== null ? String(Math.ceil(priceRange.max)) : "Any"
                    }
                  />
                </Field>
              </div>
            </fieldset>
            <Field orientation="horizontal">
              <Switch id="filter-stock" checked={stock} onCheckedChange={setStock} />
              <FieldLabel htmlFor="filter-stock" className="font-normal">
                In stock only
              </FieldLabel>
            </Field>
            <div className="flex justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setMin("");
                  setMax("");
                  setStock(false);
                }}
              >
                Clear
              </Button>
              <Button type="submit">Show results</Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>

      {(params.min !== null || params.max !== null) && (
        <Chip
          label={
            params.min !== null && params.max !== null
              ? `${formatMoney(params.min, currency)} – ${formatMoney(params.max, currency)}`
              : params.min !== null
                ? `From ${formatMoney(params.min, currency)}`
                : `Up to ${formatMoney(params.max!, currency)}`
          }
          onRemove={() => void setParams({ min: null, max: null, page: null })}
        />
      )}
      {params.stock && (
        <Chip label="In stock" onRemove={() => void setParams({ stock: null, page: null })} />
      )}
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-1 pr-1 pl-3 text-sm">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={`Remove filter: ${label}`}
      >
        <XIcon className="size-3.5" />
      </button>
    </span>
  );
}
