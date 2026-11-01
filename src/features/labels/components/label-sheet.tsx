"use client";

import { MinusIcon, PlusIcon, PrinterIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { Barcode } from "@/components/shared/barcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { searchLabelVariants } from "@/features/labels/actions";
import { type LabelVariant } from "@/features/labels/shared";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const FORMATS = {
  a4: { label: "A4 sheet · 24 per page (70 × 37 mm)", page: "size: A4; margin: 0" },
  roll: { label: "Label roll · 50 × 25 mm", page: "size: 50mm 25mm; margin: 0" },
} as const;
type Format = keyof typeof FORMATS;

type Line = LabelVariant & { copies: number };

/** Pick products and copies, preview the labels, and print them. */
export function LabelSheet({
  organizationSlug,
  initial,
}: {
  organizationSlug: string;
  initial: Line[];
}) {
  const [lines, setLines] = useState<Line[]>(initial);
  const [format, setFormat] = useState<Format>("a4");
  const [showPrice, setShowPrice] = useState(true);
  const labels = lines.flatMap((l) => Array.from({ length: l.copies }, () => l));
  const update = (id: string, copies: number) =>
    setLines((ls) =>
      ls.map((l) => (l.id === id ? { ...l, copies: Math.min(Math.max(copies, 1), 500) } : l)),
    );

  return (
    <div className="space-y-6">
      <style>{`@media print { @page { ${FORMATS[format].page}; } }`}</style>
      <Card className="print:hidden">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Labels to print</CardTitle>
          <VariantPicker
            organizationSlug={organizationSlug}
            exclude={new Set(lines.map((l) => l.id))}
            onSelect={(v) => setLines((ls) => [...ls, { ...v, copies: 1 }])}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          {lines.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Add products. Each label has the barcode (EAN-13 if the product has one, otherwise its
              SKU as Code 128), the name and the price.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {lines.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 p-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {l.productTitle}
                      {l.title !== "Default" ? ` · ${l.title}` : ""}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {l.barcode ?? l.sku}
                    </span>
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label={`Fewer ${l.sku}`}
                      onClick={() => update(l.id, l.copies - 1)}
                    >
                      <MinusIcon />
                    </Button>
                    <Input
                      className="w-16 text-center"
                      inputMode="numeric"
                      aria-label={`Copies of ${l.sku}`}
                      value={l.copies}
                      onChange={(e) => update(l.id, Number(e.target.value.replace(/\D/g, "")) || 1)}
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label={`More ${l.sku}`}
                      onClick={() => update(l.id, l.copies + 1)}
                    >
                      <PlusIcon />
                    </Button>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${l.sku}`}
                    onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}
                  >
                    <Trash2Icon />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-4">
            <Field className="w-auto">
              <FieldLabel htmlFor="label-format">Paper</FieldLabel>
              <Select value={format} onValueChange={(v) => setFormat(v as Format)}>
                <SelectTrigger id="label-format" className="w-80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FORMATS) as Format[]).map((f) => (
                    <SelectItem key={f} value={f}>
                      {FORMATS[f].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field orientation="horizontal" className="w-auto">
              <Switch id="label-price" checked={showPrice} onCheckedChange={setShowPrice} />
              <FieldLabel htmlFor="label-price">Show price</FieldLabel>
            </Field>
            <Button
              className="ml-auto"
              disabled={labels.length === 0}
              onClick={() => window.print()}
            >
              <PrinterIcon />
              Print {labels.length} label{labels.length === 1 ? "" : "s"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {labels.length > 0 && (
        <div
          aria-label="Label preview"
          className={cn(
            format === "a4"
              ? "mx-auto grid w-[210mm] grid-cols-3 bg-white print:w-[210mm]"
              : "flex flex-wrap gap-3 print:block",
          )}
        >
          {labels.map((l, i) => (
            <div
              key={`${l.id}-${i}`}
              className={cn(
                "flex flex-col justify-between overflow-hidden bg-white p-[2.5mm] text-black",
                format === "a4"
                  ? "h-[37.125mm] w-[70mm] border border-dashed border-neutral-200 print:border-0"
                  : "h-[25mm] w-[50mm] border border-dashed border-neutral-300 print:break-after-page print:border-0",
              )}
            >
              <div className="flex items-baseline justify-between gap-1 leading-tight">
                <span className="line-clamp-2 text-[8pt] font-medium">
                  {l.productTitle}
                  {l.title !== "Default" ? ` · ${l.title}` : ""}
                </span>
                {showPrice && (
                  <span className="shrink-0 text-[9pt] font-bold">
                    {formatMoney(l.price, "INR")}
                  </span>
                )}
              </div>
              <Barcode value={l.barcode || l.sku} height={format === "a4" ? 34 : 26} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VariantPicker({
  organizationSlug,
  exclude,
  onSelect,
}: {
  organizationSlug: string;
  exclude: ReadonlySet<string>;
  onSelect: (v: LabelVariant) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LabelVariant[]>([]);
  const [isPending, startTransition] = useTransition();
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(
      () =>
        startTransition(async () => {
          const r = await searchLabelVariants({ organizationSlug, query });
          if (!cancelled && r.ok) setResults(r.data);
        }),
      200,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, query, organizationSlug]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <PlusIcon />
          Add product
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem] p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search name or SKU" value={query} onValueChange={setQuery} />
          <CommandList>
            {isPending && results.length === 0 ? (
              <div className="flex justify-center p-4">
                <Spinner />
              </div>
            ) : (
              <CommandEmpty>No products found.</CommandEmpty>
            )}
            <CommandGroup>
              {results
                .filter((v) => !exclude.has(v.id))
                .map((v) => (
                  <CommandItem
                    key={v.id}
                    value={v.id}
                    onSelect={() => {
                      onSelect(v);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate">
                        {v.productTitle}
                        {v.title !== "Default" ? ` · ${v.title}` : ""}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">{v.sku}</div>
                    </div>
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
