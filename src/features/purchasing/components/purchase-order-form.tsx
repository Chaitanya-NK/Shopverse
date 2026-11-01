"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { type z } from "zod";

import { DatePicker } from "@/components/shared/date-picker";
import { FormRootError } from "@/components/shared/form-root-error";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { routes } from "@/config/routes";
import {
  type PurchasableVariant,
  savePurchaseOrder,
  searchPurchasableVariants,
} from "@/features/purchasing/actions";
import { SupplierDialog } from "@/features/purchasing/components/supplier-dialog";
import {
  type PurchaseOrderFormInput,
  purchaseOrderFormSchema,
  purchaseOrderTotals,
} from "@/features/purchasing/schemas";
import { applyActionError } from "@/lib/forms/apply-action-error";
import { formatMoney } from "@/lib/format";

export type PurchaseOrderLineDraft = {
  variantId: string;
  sku: string;
  title: string;
  productTitle: string;
  quantity: number | string;
  unitCost: number | string;
  taxRate: number | string;
};

type FormValues = Omit<PurchaseOrderFormInput, "lines"> & { lines: PurchaseOrderLineDraft[] };

type Props = {
  organizationSlug: string;
  suppliers: { id: string; name: string }[];
  warehouses: { id: string; name: string }[];
  initial?: {
    purchaseOrderId?: string;
    supplierId?: string;
    warehouseId?: string;
    expectedAt?: string | null;
    supplierReference?: string | null;
    notes?: string | null;
    lines: PurchaseOrderLineDraft[];
  };
};

const num = (v: number | string | undefined) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function PurchaseOrderForm({
  organizationSlug,
  suppliers: initialSuppliers,
  warehouses,
  initial,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const form = useForm<FormValues, unknown, z.output<typeof purchaseOrderFormSchema>>({
    resolver: zodResolver(purchaseOrderFormSchema) as never,
    defaultValues: {
      organizationSlug,
      purchaseOrderId: initial?.purchaseOrderId,
      supplierId:
        initial?.supplierId ?? (initialSuppliers.length === 1 ? initialSuppliers[0]!.id : ""),
      warehouseId: initial?.warehouseId ?? (warehouses.length === 1 ? warehouses[0]!.id : ""),
      expectedAt: initial?.expectedAt ?? "",
      supplierReference: initial?.supplierReference ?? "",
      notes: initial?.notes ?? "",
      lines: initial?.lines ?? [],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });
  const lines = useWatch({ control: form.control, name: "lines" }) ?? [];
  const totals = purchaseOrderTotals(
    lines.map((l) => ({
      quantity: num(l.quantity),
      unitCost: num(l.unitCost),
      taxRate: num(l.taxRate),
    })),
  );

  // Validated in the browser; the server parses the raw values again.
  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      const result = await savePurchaseOrder(form.getValues());
      if (!result.ok) {
        applyActionError(form, result.error);
        return;
      }
      toast.success(
        initial?.purchaseOrderId ? "Purchase order saved" : "Draft purchase order created",
      );
      router.push(routes.orgPurchaseOrder(organizationSlug, result.data.purchaseOrderId));
    }),
  );

  const linesError = form.formState.errors.lines;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Supplier and delivery</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="supplierId"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="po-supplier">Supplier</FieldLabel>
                  <div className="flex gap-2">
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="po-supplier"
                        className="w-full"
                        aria-invalid={fieldState.invalid}
                      >
                        <SelectValue placeholder="Choose a supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <SupplierDialog
                      organizationSlug={organizationSlug}
                      onSaved={(s) => {
                        setSuppliers((list) =>
                          [...list, s].sort((a, b) => a.name.localeCompare(b.name)),
                        );
                        form.setValue("supplierId", s.id, { shouldValidate: true });
                      }}
                      trigger={
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="New supplier"
                        >
                          <PlusIcon />
                        </Button>
                      }
                    />
                  </div>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="warehouseId"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="po-warehouse">Deliver to</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="po-warehouse"
                      className="w-full"
                      aria-invalid={fieldState.invalid}
                    >
                      <SelectValue placeholder="Choose a warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="expectedAt"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="po-expected">Expected by (optional)</FieldLabel>
                  <DatePicker
                    id="po-expected"
                    value={field.value ?? ""}
                    onChange={field.onChange}
                  />
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="supplierReference"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="po-reference">
                    Supplier&apos;s quote or order no. (optional)
                  </FieldLabel>
                  <Input id="po-reference" {...field} value={field.value ?? ""} />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Products</CardTitle>
          <VariantPicker
            organizationSlug={organizationSlug}
            exclude={new Set(lines.map((l) => l.variantId))}
            onSelect={(v) =>
              append({
                variantId: v.id,
                sku: v.sku,
                title: v.title,
                productTitle: v.productTitle,
                quantity: 1,
                unitCost: v.costPrice ?? "",
                taxRate: v.gstRate ?? 0,
              })
            }
          />
        </CardHeader>
        <CardContent className="space-y-3">
          {fields.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Add the products you&apos;re ordering.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="w-28">Quantity</TableHead>
                    <TableHead className="w-36">Unit cost (₹, before GST)</TableHead>
                    <TableHead className="w-24">GST %</TableHead>
                    <TableHead className="w-32 text-right">Amount</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((f, i) => {
                    const line = lines[i];
                    const name = `${f.productTitle}${f.title && f.title !== "Default" ? ` · ${f.title}` : ""}`;
                    return (
                      <TableRow key={f.id}>
                        <TableCell>
                          <div className="font-medium">{name}</div>
                          <div className="font-mono text-xs text-muted-foreground">{f.sku}</div>
                        </TableCell>
                        {(["quantity", "unitCost", "taxRate"] as const).map((key) => (
                          <TableCell key={key} className="align-top">
                            <Controller
                              control={form.control}
                              name={`lines.${i}.${key}`}
                              render={({ field, fieldState }) => (
                                <>
                                  <Input
                                    {...field}
                                    value={field.value ?? ""}
                                    inputMode="decimal"
                                    aria-label={`${key === "quantity" ? "Quantity" : key === "unitCost" ? "Unit cost" : "GST rate"} for ${name}`}
                                    aria-invalid={fieldState.invalid}
                                  />
                                  {fieldState.error && (
                                    <p className="mt-1 text-xs text-destructive">
                                      {fieldState.error.message}
                                    </p>
                                  )}
                                </>
                              )}
                            />
                          </TableCell>
                        ))}
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(num(line?.quantity) * num(line?.unitCost), "INR")}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${name}`}
                            onClick={() => remove(i)}
                          >
                            <Trash2Icon />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="text-right">
                      Subtotal
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(totals.subtotal, "INR")}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={4} className="text-right">
                      GST
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(totals.tax, "INR")}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={4} className="text-right font-semibold">
                      Total
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatMoney(totals.total, "INR")}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
          {linesError?.root?.message || linesError?.message ? (
            <p className="text-sm text-destructive">
              {linesError.root?.message ?? linesError.message}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Controller
            control={form.control}
            name="notes"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="po-notes">Notes for the supplier (optional)</FieldLabel>
                <Textarea id="po-notes" rows={3} {...field} value={field.value ?? ""} />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </CardContent>
      </Card>

      <FormRootError form={form} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Spinner />}
          {initial?.purchaseOrderId ? "Save draft" : "Create draft"}
        </Button>
      </div>
    </form>
  );
}

function VariantPicker({
  organizationSlug,
  exclude,
  onSelect,
}: {
  organizationSlug: string;
  exclude: ReadonlySet<string>;
  onSelect: (v: PurchasableVariant) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PurchasableVariant[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(
      () =>
        startTransition(async () => {
          const result = await searchPurchasableVariants({ organizationSlug, query });
          if (!cancelled && result.ok) setResults(result.data);
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
        <Button type="button" variant="outline">
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
                        {v.title && v.title !== "Default" ? ` · ${v.title}` : ""}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">{v.sku}</div>
                    </div>
                    {v.costPrice !== null && (
                      <span className="text-xs text-muted-foreground">
                        {formatMoney(v.costPrice, "INR")}
                      </span>
                    )}
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
