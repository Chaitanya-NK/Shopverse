"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { type z } from "zod";

import { FormRootError } from "@/components/shared/form-root-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { routes } from "@/config/routes";
import { createOrder, type SellableVariant } from "@/features/orders/actions";
import { SellablePicker } from "@/features/orders/components/sellable-picker";
import { INDIAN_STATES } from "@/features/orders/india";
import {
  createOrderSchema,
  PAYMENT_METHOD_LABELS,
  STAFF_PAYMENT_METHODS,
} from "@/features/orders/schemas";
import { orderTotals } from "@/features/orders/totals";
import { applyActionError } from "@/lib/forms/apply-action-error";
import { formatMoney } from "@/lib/format";

type FormInput = z.input<typeof createOrderSchema>;
type FormOutput = z.output<typeof createOrderSchema>;

type ShopOption = { id: string; name: string; currency: string };

type OrderFormProps = {
  organizationSlug: string;
  shops: ShopOption[];
  defaultShopId?: string;
};

const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[,\s₹]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function OrderForm({ organizationSlug, shops, defaultShopId }: OrderFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sameContact, setSameContact] = useState(true);
  // Display details for each added line (not sent to the server).
  const [meta, setMeta] = useState<Record<string, SellableVariant>>({});

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: {
      organizationSlug,
      shopId: defaultShopId ?? shops[0]?.id ?? "",
      customer: { fullName: "", email: "", phone: "" },
      address: { name: "", phone: "", line1: "", line2: "", city: "", state: "", postalCode: "" },
      lines: [],
      paymentMethod: "upi",
      paid: false,
      shippingTotal: "",
      discountTotal: "",
      notes: "",
      confirm: true,
    },
  });
  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "lines",
    keyName: "key",
  });

  const [shopId, lines, shipping, discount, paymentMethod] = useWatch({
    control: form.control,
    name: ["shopId", "lines", "shippingTotal", "discountTotal", "paymentMethod"],
  });
  const currency = shops.find((s) => s.id === shopId)?.currency ?? "INR";
  const totals = orderTotals(
    (lines ?? []).map((l) => ({
      quantity: num(l.quantity),
      unitPrice: num(l.unitPrice),
      gstRate: meta[l.variantId]?.gstRate ?? 0,
    })),
    num(shipping),
    num(discount),
  );

  const addLine = (variant: SellableVariant) => {
    setMeta((m) => ({ ...m, [variant.id]: variant }));
    append({ variantId: variant.id, quantity: "1", unitPrice: String(variant.price) });
  };

  /** Keep the delivery contact in step with the customer while "same" is ticked. */
  const syncContact = (field: "fullName" | "phone", value: string) => {
    if (!sameContact) return;
    form.setValue(field === "fullName" ? "address.name" : "address.phone", value, {
      shouldValidate: form.formState.isSubmitted,
    });
  };

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await createOrder(values);
      if (!result.ok) {
        applyActionError(form, result.error);
        return;
      }
      toast.success(values.confirm ? "Order created and stock reserved" : "Order saved as pending");
      router.push(routes.orgOrder(organizationSlug, result.data.id));
    }),
  );

  const linesError =
    form.formState.errors.lines?.root?.message ?? form.formState.errors.lines?.message;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
            <CardDescription>
              Prices include GST. Stock is checked across the shop’s warehouses.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {shops.length > 1 && (
              <Controller
                name="shopId"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="max-w-xs">
                    <FieldLabel htmlFor="order-shop">Shop</FieldLabel>
                    <Select
                      value={field.value}
                      onValueChange={(next) => {
                        field.onChange(next);
                        replace([]); // stock and prices are per shop
                        setMeta({});
                      }}
                    >
                      <SelectTrigger id="order-shop" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {shops.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            )}

            {fields.length > 0 && (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="pl-3">Product</TableHead>
                      <TableHead className="w-24">Qty</TableHead>
                      <TableHead className="w-32">Price</TableHead>
                      <TableHead className="w-28 text-right">Total</TableHead>
                      <TableHead className="w-10 pr-3">
                        <span className="sr-only">Remove</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((row, index) => {
                      const info = meta[row.variantId];
                      const qty = num(lines?.[index]?.quantity);
                      const short = info && qty > info.available;
                      const label = info
                        ? `${info.productTitle}${info.title !== "Default" ? ` · ${info.title}` : ""}`
                        : "Product";
                      return (
                        <TableRow key={row.key} className="align-top hover:bg-transparent">
                          <TableCell className="pt-3 pl-3 whitespace-normal">
                            <span className="font-medium">{label}</span>
                            <span className="block font-mono text-xs text-muted-foreground">
                              {info?.sku}
                            </span>
                            {short && (
                              <span className="block text-xs text-destructive">
                                Only {info.available} in stock for this shop
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Controller
                              name={`lines.${index}.quantity`}
                              control={form.control}
                              render={({ field, fieldState }) => (
                                <>
                                  <Input
                                    {...field}
                                    value={String(field.value ?? "")}
                                    inputMode="numeric"
                                    aria-label={`Quantity of ${label}`}
                                    aria-invalid={fieldState.invalid}
                                    className="min-w-16 tabular-nums"
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
                          <TableCell>
                            <Controller
                              name={`lines.${index}.unitPrice`}
                              control={form.control}
                              render={({ field, fieldState }) => (
                                <>
                                  <Input
                                    {...field}
                                    value={String(field.value ?? "")}
                                    inputMode="decimal"
                                    aria-label={`Price of ${label}`}
                                    aria-invalid={fieldState.invalid}
                                    className="min-w-24 tabular-nums"
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
                          <TableCell className="pt-4 text-right tabular-nums">
                            {formatMoney(qty * num(lines?.[index]?.unitPrice), currency)}
                          </TableCell>
                          <TableCell className="pr-3">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Remove ${label}`}
                              onClick={() => remove(index)}
                            >
                              <Trash2Icon />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            <SellablePicker
              organizationSlug={organizationSlug}
              shopId={shopId}
              currency={currency}
              excludeIds={new Set(fields.map((f) => f.variantId))}
              onSelect={addLine}
            />
            {linesError && <p className="text-sm text-destructive">{linesError}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
            <CardDescription>Returning customers are matched by email or phone.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-5 sm:grid-cols-2">
              <Controller
                name="customer.phone"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="customer-phone">Phone</FieldLabel>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      id="customer-phone"
                      type="tel"
                      autoComplete="tel"
                      placeholder="+91 98765 43210"
                      aria-invalid={fieldState.invalid}
                      onChange={(e) => {
                        field.onChange(e);
                        syncContact("phone", e.target.value);
                      }}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="customer.fullName"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="customer-name">Name</FieldLabel>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      id="customer-name"
                      autoComplete="name"
                      aria-invalid={fieldState.invalid}
                      onChange={(e) => {
                        field.onChange(e);
                        syncContact("fullName", e.target.value);
                      }}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="customer.email"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="sm:col-span-2">
                    <FieldLabel htmlFor="customer-email">Email (optional)</FieldLabel>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      id="customer-email"
                      type="email"
                      autoComplete="email"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deliver to</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field orientation="horizontal">
                <Checkbox
                  id="same-contact"
                  checked={sameContact}
                  onCheckedChange={(checked) => {
                    setSameContact(checked === true);
                    if (checked === true) {
                      const opts = { shouldValidate: form.formState.isSubmitted };
                      form.setValue(
                        "address.name",
                        form.getValues("customer.fullName") ?? "",
                        opts,
                      );
                      form.setValue("address.phone", form.getValues("customer.phone") ?? "", opts);
                    }
                  }}
                />
                <FieldLabel htmlFor="same-contact" className="font-normal">
                  Same name and phone as the customer
                </FieldLabel>
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField
                  form={form}
                  name="address.name"
                  label="Recipient"
                  autoComplete="name"
                  disabled={sameContact}
                />
                <TextField
                  form={form}
                  name="address.phone"
                  label="Recipient phone"
                  autoComplete="tel"
                  type="tel"
                  disabled={sameContact}
                />
              </div>
              <TextField
                form={form}
                name="address.line1"
                label="Address"
                autoComplete="address-line1"
                placeholder="House, street, area"
              />
              <TextField
                form={form}
                name="address.line2"
                label="Landmark (optional)"
                autoComplete="address-line2"
              />
              <div className="grid gap-5 sm:grid-cols-3">
                <TextField
                  form={form}
                  name="address.city"
                  label="City"
                  autoComplete="address-level2"
                />
                <Controller
                  name="address.state"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="address-state">State</FieldLabel>
                      <Select value={field.value || undefined} onValueChange={field.onChange}>
                        <SelectTrigger
                          id="address-state"
                          className="w-full"
                          aria-invalid={fieldState.invalid}
                        >
                          <SelectValue placeholder="Choose" />
                        </SelectTrigger>
                        <SelectContent>
                          {INDIAN_STATES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
                <TextField
                  form={form}
                  name="address.postalCode"
                  label="PIN code"
                  autoComplete="postal-code"
                  inputMode="numeric"
                />
              </div>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Controller
                name="paymentMethod"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="payment-method">Method</FieldLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        if (v === "cod") form.setValue("paid", false);
                      }}
                    >
                      <SelectTrigger id="payment-method" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAFF_PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {PAYMENT_METHOD_LABELS[m]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />
              <Controller
                name="paid"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field
                    orientation="horizontal"
                    data-invalid={fieldState.invalid}
                    data-disabled={paymentMethod === "cod" || undefined}
                  >
                    <FieldContent>
                      <FieldLabel htmlFor="payment-paid">Payment received</FieldLabel>
                      <FieldDescription>
                        {paymentMethod === "cod"
                          ? "Marked paid when the last parcel is delivered."
                          : "Already collected?"}
                      </FieldDescription>
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </FieldContent>
                    <Switch
                      id="payment-paid"
                      checked={field.value}
                      disabled={paymentMethod === "cod"}
                      onCheckedChange={field.onChange}
                    />
                  </Field>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <TextField
                  form={form}
                  name="shippingTotal"
                  label="Shipping"
                  inputMode="decimal"
                  placeholder="0"
                />
                <TextField
                  form={form}
                  name="discountTotal"
                  label="Discount"
                  inputMode="decimal"
                  placeholder="0"
                />
              </div>
            </FieldGroup>

            <Separator className="my-5" />

            <dl className="space-y-2 text-sm">
              <Row label="Subtotal" value={formatMoney(totals.subtotal, currency)} />
              {totals.discount > 0 && (
                <Row label="Discount" value={`− ${formatMoney(totals.discount, currency)}`} />
              )}
              {totals.shipping > 0 && (
                <Row label="Shipping" value={formatMoney(totals.shipping, currency)} />
              )}
              <Row label="Total" value={formatMoney(totals.grandTotal, currency)} strong />
              <p className="text-xs text-muted-foreground">
                Includes {formatMoney(totals.tax, currency)} GST
              </p>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-5">
            <Controller
              name="notes"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="order-notes">Internal note</FieldLabel>
                  <Textarea
                    {...field}
                    value={field.value ?? ""}
                    id="order-notes"
                    rows={3}
                    placeholder="Gift wrap, call before delivery…"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="confirm"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="order-confirm">Confirm now</FieldLabel>
                    <FieldDescription>
                      Reserve the stock straight away. Turn off to save it as pending.
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id="order-confirm"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </Field>
              )}
            />
          </CardContent>
        </Card>

        <div className="grid gap-3 lg:sticky lg:top-20">
          <FormRootError form={form} />
          <Button type="submit" size="lg" disabled={isPending}>
            {isPending && <Spinner />}
            Create order · {formatMoney(totals.grandTotal, currency)}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={
        strong
          ? "flex justify-between border-t pt-2 text-base font-semibold"
          : "flex justify-between"
      }
    >
      <dt className={strong ? undefined : "text-muted-foreground"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

type TextFieldName =
  | "address.name"
  | "address.phone"
  | "address.line1"
  | "address.line2"
  | "address.city"
  | "address.postalCode"
  | "shippingTotal"
  | "discountTotal";

function TextField({
  form,
  name,
  label,
  ...inputProps
}: {
  form: ReturnType<typeof useForm<FormInput, unknown, FormOutput>>;
  name: TextFieldName;
  label: string;
} & Pick<
  React.ComponentProps<"input">,
  "autoComplete" | "placeholder" | "inputMode" | "type" | "disabled"
>) {
  const id = `order-${name.replace(".", "-")}`;
  return (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} data-disabled={inputProps.disabled || undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Input
            {...field}
            {...inputProps}
            value={String(field.value ?? "")}
            id={id}
            aria-invalid={fieldState.invalid}
          />
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}
