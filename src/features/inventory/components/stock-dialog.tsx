"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Controller, type FieldErrors, type Resolver, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FormRootError } from "@/components/shared/form-root-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { DatePicker } from "@/components/shared/date-picker";
import { Textarea } from "@/components/ui/textarea";
import {
  type BatchOption,
  listBatches,
  listInStockSerials,
  receiveStock,
  removeStock,
  transferStock,
  type VariantSearchResult,
} from "@/features/inventory/actions";
import { SerialPicker } from "@/features/inventory/components/serial-picker";
import { VariantPicker } from "@/features/inventory/components/variant-picker";
import {
  parseSerials,
  RECEIVE_TYPE_LABELS,
  RECEIVE_TYPES,
  receiveStockSchema,
  REMOVE_TYPE_LABELS,
  REMOVE_TYPES,
  removeStockSchema,
  transferStockSchema,
} from "@/features/inventory/schemas";
import { applyActionError } from "@/lib/forms/apply-action-error";

export type StockOperation = "receive" | "remove" | "transfer";

export type WarehouseOption = { id: string; name: string; isActive: boolean };

type StockDialogProps = {
  organizationSlug: string;
  operation: StockOperation;
  warehouses: WarehouseOption[];
  /** Prefill from a row: the variant and the warehouse it sits in. */
  preset?: { variant: VariantSearchResult; warehouseId: string };
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const COPY: Record<StockOperation, { title: string; description: string; submit: string }> = {
  receive: {
    title: "Receive stock",
    description: "Add units to a warehouse: a delivery, a customer return or a count correction.",
    submit: "Receive",
  },
  remove: {
    title: "Remove stock",
    description: "Take units out: sold offline, damaged or expired, or a count correction.",
    submit: "Remove",
  },
  transfer: {
    title: "Transfer stock",
    description: "Move units between warehouses. Both sides are recorded together.",
    submit: "Transfer",
  },
};

export function StockDialog({ trigger, open: openProp, onOpenChange, ...props }: StockDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const copy = COPY[props.operation];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <StockForm {...props} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

type FormValues = {
  variant: VariantSearchResult | null;
  warehouseId: string;
  toWarehouseId: string;
  type: string;
  quantity: string;
  serialsText: string;
  pickedSerials: string[];
  batchCode: string;
  expiryDate: string;
  batchId: string;
  note: string;
};

/** Form values -> the action's input for this operation and tracking mode. */
function toPayload(operation: StockOperation, organizationSlug: string, v: FormValues) {
  const tracking = v.variant?.tracking ?? "quantity";
  const common = { organizationSlug, variantId: v.variant?.id ?? "", note: v.note, tracking };
  const serials = operation === "receive" ? parseSerials(v.serialsText) : v.pickedSerials;
  const amounts =
    tracking === "serial"
      ? { serials }
      : tracking === "batch"
        ? operation === "receive"
          ? { quantity: v.quantity, batchCode: v.batchCode, expiryDate: v.expiryDate || null }
          : { quantity: v.quantity, batchId: v.batchId }
        : { quantity: v.quantity };

  if (operation === "transfer") {
    return {
      ...common,
      ...amounts,
      fromWarehouseId: v.warehouseId,
      toWarehouseId: v.toWarehouseId,
    };
  }
  return { ...common, ...amounts, warehouseId: v.warehouseId, type: v.type };
}

const SCHEMAS = {
  receive: receiveStockSchema,
  remove: removeStockSchema,
  transfer: transferStockSchema,
};

/** Where each payload field is edited in the form. */
function formFieldFor(operation: StockOperation, path: string): keyof FormValues {
  const field = path.split(".")[0] ?? "";
  if (field === "variantId") return "variant";
  if (field === "fromWarehouseId") return "warehouseId";
  if (field === "serials") return operation === "receive" ? "serialsText" : "pickedSerials";
  return (field || "note") as keyof FormValues;
}

function StockForm({
  organizationSlug,
  operation,
  warehouses,
  preset,
  onDone,
}: Omit<StockDialogProps, "trigger" | "open" | "onOpenChange"> & { onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const copy = COPY[operation];

  const resolver = useMemo<Resolver<FormValues>>(
    () => async (values) => {
      const parsed = SCHEMAS[operation].safeParse(toPayload(operation, organizationSlug, values));
      if (parsed.success) return { values, errors: {} };
      const errors: FieldErrors<FormValues> = {};
      for (const issue of parsed.error.issues) {
        const field = formFieldFor(operation, issue.path.join("."));
        errors[field] ??= { type: "validation", message: issue.message };
      }
      return { values: {}, errors };
    },
    [operation, organizationSlug],
  );

  const form = useForm<FormValues>({
    resolver,
    defaultValues: {
      variant: preset?.variant ?? null,
      warehouseId:
        preset?.warehouseId ??
        (operation === "receive" ? (warehouses.find((w) => w.isActive)?.id ?? "") : ""),
      toWarehouseId: "",
      type: operation === "remove" ? "sale" : "receipt",
      quantity: "",
      serialsText: "",
      pickedSerials: [],
      batchCode: "",
      expiryDate: "",
      batchId: "",
      note: "",
    },
  });

  const [variant, warehouseId, serialsText] = useWatch({
    control: form.control,
    name: ["variant", "warehouseId", "serialsText"],
  });
  const tracking = variant?.tracking ?? "quantity";
  const needsStockList =
    operation !== "receive" && tracking !== "quantity" && variant && warehouseId;

  // In-stock serials or batches at the source warehouse, for picking.
  const [serialOptions, setSerialOptions] = useState<string[] | null>(null);
  const [batchOptions, setBatchOptions] = useState<BatchOption[] | null>(null);
  useEffect(() => {
    if (!needsStockList) return;
    let cancelled = false;
    const location = { organizationSlug, variantId: variant.id, warehouseId };
    void (async () => {
      if (tracking === "serial") {
        const result = await listInStockSerials(location);
        if (!cancelled) setSerialOptions(result.ok ? result.data : []);
      } else {
        const result = await listBatches(location);
        if (!cancelled) {
          const batches = result.ok ? result.data : [];
          setBatchOptions(batches);
          // FEFO: suggest the batch that expires first.
          if (batches[0] && !form.getValues("batchId")) form.setValue("batchId", batches[0].id);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needsStockList, tracking, variant?.id, warehouseId, organizationSlug, form]);

  /** The source changed: forget picked units and reload the lists. */
  const resetStockPick = () => {
    form.setValue("pickedSerials", []);
    form.setValue("batchId", "");
    setSerialOptions(null);
    setBatchOptions(null);
  };

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const payload = toPayload(operation, organizationSlug, values);
      const result =
        operation === "receive"
          ? await receiveStock(payload as Parameters<typeof receiveStock>[0])
          : operation === "remove"
            ? await removeStock(payload as Parameters<typeof removeStock>[0])
            : await transferStock(payload as Parameters<typeof transferStock>[0]);
      if (!result.ok) {
        const mapped = Object.fromEntries(
          Object.entries(result.error.fieldErrors ?? {}).map(([k, v]) => [
            formFieldFor(operation, k),
            v,
          ]),
        );
        applyActionError(form, { ...result.error, fieldErrors: mapped });
        return;
      }
      toast.success(
        operation === "transfer"
          ? "Stock transferred"
          : operation === "receive"
            ? "Stock received"
            : "Stock removed",
      );
      onDone();
    }),
  );

  const sourceLabel = operation === "transfer" ? "From" : "Warehouse";
  const serialCount = parseSerials(serialsText).length;
  const activeWarehouses = warehouses.filter((w) => w.isActive);
  const sourceChoices = operation === "receive" ? activeWarehouses : warehouses;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FieldGroup>
        <Controller
          name="variant"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="stock-variant">Product</FieldLabel>
              <VariantPicker
                id="stock-variant"
                organizationSlug={organizationSlug}
                value={field.value}
                disabled={Boolean(preset)}
                invalid={fieldState.invalid}
                onChange={(next) => {
                  field.onChange(next);
                  resetStockPick();
                }}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            name="warehouseId"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="stock-warehouse">{sourceLabel}</FieldLabel>
                <Select
                  value={field.value || undefined}
                  disabled={operation !== "receive" && Boolean(preset)}
                  onValueChange={(next) => {
                    field.onChange(next);
                    resetStockPick();
                  }}
                >
                  <SelectTrigger
                    id="stock-warehouse"
                    className="w-full"
                    aria-invalid={fieldState.invalid}
                  >
                    <SelectValue placeholder="Choose" />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceChoices.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          {operation === "transfer" ? (
            <Controller
              name="toWarehouseId"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="stock-to">To</FieldLabel>
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="stock-to"
                      className="w-full"
                      aria-invalid={fieldState.invalid}
                    >
                      <SelectValue placeholder="Choose" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeWarehouses
                        .filter((w) => w.id !== warehouseId)
                        .map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          ) : (
            <Controller
              name="type"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="stock-type">Reason</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="stock-type" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {operation === "receive"
                        ? RECEIVE_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {RECEIVE_TYPE_LABELS[t]}
                            </SelectItem>
                          ))
                        : REMOVE_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {REMOVE_TYPE_LABELS[t]}
                            </SelectItem>
                          ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
          )}
        </div>

        {/* Serial numbers: typed or scanned in when receiving, picked from stock otherwise. */}
        {tracking === "serial" && operation === "receive" && (
          <Controller
            name="serialsText"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="stock-serials" className="justify-between">
                  Serial / IMEI numbers
                  {serialCount > 0 && (
                    <Badge variant="secondary">
                      {serialCount} unit{serialCount === 1 ? "" : "s"}
                    </Badge>
                  )}
                </FieldLabel>
                <Textarea
                  {...field}
                  id="stock-serials"
                  rows={5}
                  className="font-mono"
                  placeholder={"Scan or paste, one per line\n356938035643809\n356938035643817"}
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>
                  Each unit is tracked individually. Duplicates are ignored.
                </FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        )}

        {tracking === "serial" && operation !== "receive" && variant && warehouseId && (
          <Controller
            name="pickedSerials"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel className="justify-between">
                  Units
                  {field.value.length > 0 && (
                    <Badge variant="secondary">{field.value.length} selected</Badge>
                  )}
                </FieldLabel>
                <SerialPicker
                  options={serialOptions}
                  value={field.value}
                  onChange={field.onChange}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        )}

        {tracking === "batch" && operation === "receive" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              name="batchCode"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="stock-batch-code">Batch / lot</FieldLabel>
                  <Input
                    {...field}
                    id="stock-batch-code"
                    className="font-mono uppercase"
                    placeholder="B-2026-11"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="expiryDate"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="stock-expiry">Expiry date</FieldLabel>
                  <DatePicker
                    id="stock-expiry"
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder="Choose expiry"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </div>
        )}

        {tracking === "batch" && operation !== "receive" && variant && warehouseId && (
          <Controller
            name="batchId"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="stock-batch">Batch</FieldLabel>
                <Select
                  value={field.value || undefined}
                  onValueChange={field.onChange}
                  disabled={!batchOptions?.length}
                >
                  <SelectTrigger
                    id="stock-batch"
                    className="w-full"
                    aria-invalid={fieldState.invalid}
                  >
                    <SelectValue
                      placeholder={batchOptions === null ? "Loading…" : "No batches in stock here"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(batchOptions ?? []).map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        <span className="font-mono">{b.code}</span>
                        <span className="text-muted-foreground">
                          {b.expiryDate ? ` · expires ${b.expiryDate}` : ""} · {b.onHand} in stock
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Sorted by expiry, so the first batch is the one to use first.
                </FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        )}

        {tracking !== "serial" && (
          <Controller
            name="quantity"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="max-w-40">
                <FieldLabel htmlFor="stock-quantity">Quantity</FieldLabel>
                <Input
                  {...field}
                  id="stock-quantity"
                  inputMode="numeric"
                  placeholder="0"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        )}

        <Controller
          name="note"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="stock-note">Note (optional)</FieldLabel>
              <Input
                {...field}
                id="stock-note"
                placeholder="Invoice #, supplier, reason…"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>

      <FormRootError form={form} />

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isPending}>
          {isPending && <Spinner />}
          {copy.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}
