"use client";

import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { Controller, useFieldArray, type UseFormReturn } from "react-hook-form";

import { TagInput } from "@/components/shared/tag-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  type AttributeDefinition,
  type OptionValue,
  parseOptionValue,
} from "@/features/products/attribute-values";
import {
  type ProductFormInput,
  type ProductFormOutput,
} from "@/features/products/components/product-form";
import {
  combinationCount,
  MAX_VARIANTS,
  suggestSku,
  syncVariants,
  type VariantAxis,
} from "@/features/products/variants";
import { cn } from "@/lib/utils";

type VariantBuilderProps = {
  form: UseFormReturn<ProductFormInput, unknown, ProductFormOutput>;
  /** The category's variant-option fields. */
  definitions: AttributeDefinition[];
  axes: VariantAxis[];
  onAxesChange: (axes: VariantAxis[]) => void;
  /** Variant ids that already hold stock; their combinations can't be removed. */
  lockedVariantIds?: ReadonlySet<string>;
  /** Highlight rows that will be created on save (edit mode). */
  markNew?: boolean;
};

const MONEY_COLUMNS = [
  ["price", "Price"],
  ["compareAtPrice", "Compare-at"],
  ["costPrice", "Cost"],
] as const;

export function VariantBuilder({
  form,
  definitions,
  axes,
  onAxesChange,
  lockedVariantIds,
  markNew = false,
}: VariantBuilderProps) {
  const { fields, replace } = useFieldArray({
    control: form.control,
    name: "variants",
    keyName: "key",
  });
  const [bulkPrice, setBulkPrice] = useState("");
  const units = Object.fromEntries(definitions.map((d) => [d.key, d.unit]));
  const nextCount = combinationCount(axes);
  const tooMany = nextCount > MAX_VARIANTS;

  const updateAxis = (key: string, values: OptionValue[]) => {
    const next = axes.map((axis) => (axis.key === key ? { ...axis, values } : axis));
    if (combinationCount(next) > MAX_VARIANTS) {
      onAxesChange(next);
      return; // keep the current rows until the selection is small enough
    }
    onAxesChange(next);
    replace(
      syncVariants(form.getValues("variants"), next, {
        title: form.getValues("title"),
        units,
      }),
    );
  };

  const applyPriceToAll = () => {
    if (bulkPrice.trim() === "") return;
    form
      .getValues("variants")
      .forEach((_, i) =>
        form.setValue(`variants.${i}.price`, bulkPrice.trim(), { shouldDirty: true }),
      );
  };

  const regenerateSkus = () => {
    const title = form.getValues("title");
    const order = axes.filter((a) => a.values.length > 0).map((a) => a.key);
    form.getValues("variants").forEach((row, i) => {
      if (!row.id) {
        form.setValue(`variants.${i}.sku`, suggestSku(title, row.options, order), {
          shouldDirty: true,
        });
      }
    });
  };

  const variantsError =
    form.formState.errors.variants?.root?.message ?? form.formState.errors.variants?.message;

  return (
    <div className="space-y-6">
      {definitions.length > 0 ? (
        <div className="grid gap-5">
          {definitions.map((def) => {
            const axis = axes.find((a) => a.key === def.key);
            const values = axis?.values ?? [];
            const inUse = new Set(
              fields
                .filter((row) => row.id && lockedVariantIds?.has(row.id))
                .map((row) => row.options[def.key])
                .filter((v): v is OptionValue => v !== undefined)
                .map(String),
            );
            const id = `axis-${def.key}`;
            return (
              <Field key={def.key}>
                <FieldLabel htmlFor={id}>
                  {def.label}
                  {def.unit && (
                    <span className="font-normal text-muted-foreground">({def.unit})</span>
                  )}
                </FieldLabel>
                {def.type === "select" ? (
                  <ToggleGroup
                    id={id}
                    type="multiple"
                    variant="outline"
                    size="sm"
                    spacing={2}
                    className="flex-wrap justify-start"
                    value={values.map(String)}
                    onValueChange={(next) =>
                      updateAxis(
                        def.key,
                        // keep the category's option order
                        def.options.filter((o) => next.includes(o) || inUse.has(o)),
                      )
                    }
                  >
                    {def.options.map((option) => (
                      <ToggleGroupItem
                        key={option}
                        value={option}
                        className="px-3"
                        disabled={inUse.has(option)}
                      >
                        {option}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                ) : (
                  <TagInput
                    id={id}
                    value={values.map(String)}
                    locked={inUse}
                    placeholder={
                      def.type === "number" ? "e.g. 6.1, 6.7" : "Type a value and press Enter"
                    }
                    onChange={(next) =>
                      updateAxis(
                        def.key,
                        next
                          .map((raw) => parseOptionValue(def, raw))
                          .filter((v): v is OptionValue => v !== null),
                      )
                    }
                  />
                )}
              </Field>
            );
          })}
          <FieldDescription>
            {nextCount === 1 && fields.length === 1
              ? "Pick values above to create variants, or sell this as a single item."
              : `${nextCount} variant${nextCount === 1 ? "" : "s"} — one per combination.`}
          </FieldDescription>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          This category has no variant options, so the product is sold as a single item.
        </p>
      )}

      {tooMany && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>
            That would make {nextCount} variants. A product can have at most {MAX_VARIANTS}; remove
            some values.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <Field className="w-40">
          <FieldLabel htmlFor="bulk-price">Price for all</FieldLabel>
          <Input
            id="bulk-price"
            inputMode="decimal"
            placeholder="0.00"
            value={bulkPrice}
            onChange={(e) => setBulkPrice(e.target.value)}
          />
        </Field>
        <Button type="button" variant="outline" onClick={applyPriceToAll}>
          Apply
        </Button>
        <Button type="button" variant="ghost" onClick={regenerateSkus} className="ml-auto">
          <RefreshCwIcon />
          Suggest SKUs
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-48 pl-3">Variant</TableHead>
              <TableHead>SKU</TableHead>
              {MONEY_COLUMNS.map(([, label]) => (
                <TableHead key={label} className="w-28">
                  {label}
                </TableHead>
              ))}
              <TableHead className="w-36 pr-3">Barcode</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((row, index) => (
              <TableRow key={row.key} className="align-top hover:bg-transparent">
                <TableCell className="pt-4 pl-3 font-medium whitespace-normal">
                  {row.title}
                  {markNew && !row.id && (
                    <span className="ml-1.5 text-xs font-normal text-primary">new</span>
                  )}
                  <CellError form={form} name={`variants.${index}.title`} />
                </TableCell>
                <TableCell>
                  <Controller
                    name={`variants.${index}.sku`}
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <>
                        <Input
                          {...field}
                          aria-label={`SKU for ${row.title}`}
                          aria-invalid={fieldState.invalid}
                          className="min-w-44 font-mono text-xs uppercase"
                          spellCheck={false}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        />
                        <CellMessage message={fieldState.error?.message} />
                      </>
                    )}
                  />
                </TableCell>
                {MONEY_COLUMNS.map(([name, label]) => (
                  <TableCell key={name}>
                    <Controller
                      name={`variants.${index}.${name}`}
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            aria-label={`${label} for ${row.title}`}
                            aria-invalid={fieldState.invalid}
                            inputMode="decimal"
                            className="min-w-24 tabular-nums"
                            placeholder={name === "price" ? "0.00" : "—"}
                          />
                          <CellMessage message={fieldState.error?.message} />
                        </>
                      )}
                    />
                  </TableCell>
                ))}
                <TableCell className="pr-3">
                  <Controller
                    name={`variants.${index}.barcode`}
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          aria-label={`Barcode for ${row.title}`}
                          aria-invalid={fieldState.invalid}
                          className="min-w-32 font-mono text-xs"
                          placeholder="EAN / UPC"
                        />
                        <CellMessage message={fieldState.error?.message} />
                      </>
                    )}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {variantsError && <p className="text-sm text-destructive">{variantsError}</p>}
    </div>
  );
}

function CellMessage({ message }: { message?: string }) {
  if (!message) return null;
  return <p className={cn("mt-1 text-xs text-destructive")}>{message}</p>;
}

function CellError({
  form,
  name,
}: {
  form: UseFormReturn<ProductFormInput, unknown, ProductFormOutput>;
  name: `variants.${number}.title`;
}) {
  return <CellMessage message={form.getFieldState(name, form.formState).error?.message} />;
}
