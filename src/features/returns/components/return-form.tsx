"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeftRightIcon, BanknoteIcon } from "lucide-react";
import { useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { FormRootError } from "@/components/shared/form-root-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  RETURN_BLOCK_LABELS,
  RETURN_REASON_LABELS,
  RETURN_REASONS,
  type ReturnFormInput,
  type ReturnFormOutput,
  returnFormSchema,
  type ReturnOptions,
} from "@/features/returns/schemas";
import { ProductVisual } from "@/features/storefront/components/product-visual";
import { type ActionResult } from "@/lib/actions/result";
import { formatMoney } from "@/lib/format";
import { applyActionError } from "@/lib/forms/apply-action-error";
import { cn } from "@/lib/utils";

const dayFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
});

/**
 * Choose items, a reason and refund or exchange. Used by shoppers on their
 * order and by staff starting a return (who may override the shop's rules).
 */
export function ReturnForm({
  options,
  currency,
  staff = false,
  submitLabel,
  onSubmit,
  onDone,
}: {
  options: ReturnOptions;
  currency: string;
  staff?: boolean;
  submitLabel: string;
  onSubmit: (values: ReturnFormOutput) => Promise<ActionResult<unknown>>;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  // Staff can take back anything delivered; shoppers only what the rules allow.
  const selectable = (i: ReturnOptions["items"][number]) =>
    i.returnable > 0 && (staff ? i.blocked !== "cancelled" : i.blocked === null);
  const canExchange =
    options.allowExchanges && options.items.some((i) => selectable(i) && i.exchangeFor.length > 0);

  const form = useForm<ReturnFormInput, unknown, ReturnFormOutput>({
    resolver: zodResolver(returnFormSchema),
    defaultValues: {
      needsUpi: !staff && options.needsUpi,
      lines: options.items.map((i) => ({
        orderItemId: i.orderItemId,
        quantity: options.items.filter(selectable).length === 1 && selectable(i) ? i.returnable : 0,
        exchangeVariantId: null,
      })),
      reason: undefined as unknown as ReturnFormInput["reason"],
      note: "",
      resolution: "refund",
      refundUpi: "",
    },
  });
  const [lines, resolution] = useWatch({ control: form.control, name: ["lines", "resolution"] });

  const refundTotal = options.items.reduce(
    (n, item, i) => n + item.unitPaid * Number(lines?.[i]?.quantity ?? 0),
    0,
  );

  const submit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await onSubmit(values);
      if (!result.ok) {
        applyActionError(form, result.error);
        return;
      }
      onDone();
    }),
  );

  const linesError =
    form.formState.errors.lines?.message ?? form.formState.errors.lines?.root?.message;

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <FieldSet>
        <FieldLegend>What are you returning?</FieldLegend>
        <ul className="divide-y rounded-xl border">
          {options.items.map((item, i) => {
            const enabled = selectable(item);
            const quantity = Number(lines?.[i]?.quantity ?? 0);
            const chosen = quantity > 0;
            return (
              <li key={item.orderItemId} className={cn("space-y-3 p-3", !enabled && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <Controller
                    control={form.control}
                    name={`lines.${i}.quantity`}
                    render={({ field }) => (
                      <Checkbox
                        id={`return-${item.orderItemId}`}
                        className="mt-3"
                        disabled={!enabled}
                        checked={chosen}
                        onCheckedChange={(on) => field.onChange(on ? item.returnable : 0)}
                        aria-label={`Return ${item.title}`}
                      />
                    )}
                  />
                  <ProductVisual
                    image={item.image}
                    alt={item.title}
                    seed={item.title}
                    industry={null}
                    sizes="48px"
                    className="size-12 shrink-0 rounded-lg [&_svg]:size-5"
                  />
                  <label htmlFor={`return-${item.orderItemId}`} className="min-w-0 flex-1 text-sm">
                    <span className="block font-medium">{item.title}</span>
                    <span className="text-muted-foreground">
                      {formatMoney(item.unitPaid, currency)} each
                      {item.delivered > 0 && ` · ${item.delivered} delivered`}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {item.blocked
                        ? RETURN_BLOCK_LABELS[item.blocked] +
                          (staff && enabled ? " (you can still accept it)" : "")
                        : item.windowEndsAt
                          ? `Return by ${dayFormat.format(new Date(item.windowEndsAt))}`
                          : null}
                    </span>
                  </label>
                  {chosen && item.returnable > 1 && (
                    <Controller
                      control={form.control}
                      name={`lines.${i}.quantity`}
                      render={({ field }) => (
                        <Select
                          value={String(field.value)}
                          onValueChange={(v) => field.onChange(Number(v))}
                        >
                          <SelectTrigger className="w-20" aria-label={`How many ${item.title}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: item.returnable }, (_, n) => n + 1).map((n) => (
                              <SelectItem key={n} value={String(n)}>
                                {n}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  )}
                </div>
                {chosen && resolution === "exchange" && (
                  <Controller
                    control={form.control}
                    name={`lines.${i}.exchangeVariantId`}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid} className="pl-7 sm:pl-[5.75rem]">
                        <FieldLabel htmlFor={`exchange-${item.orderItemId}`}>
                          Exchange for
                        </FieldLabel>
                        {item.exchangeFor.length > 0 ? (
                          <Select value={field.value ?? ""} onValueChange={field.onChange}>
                            <SelectTrigger
                              id={`exchange-${item.orderItemId}`}
                              className="w-full sm:w-64"
                              aria-invalid={fieldState.invalid}
                            >
                              <SelectValue placeholder="Choose an option" />
                            </SelectTrigger>
                            <SelectContent>
                              {item.exchangeFor.map((v) => (
                                <SelectItem key={v.variantId} value={v.variantId}>
                                  {v.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <FieldDescription>
                            No other option is in stock right now.
                          </FieldDescription>
                        )}
                        <FieldError errors={[fieldState.error]} />
                      </Field>
                    )}
                  />
                )}
              </li>
            );
          })}
        </ul>
        {linesError && <p className="text-sm text-destructive">{linesError}</p>}
      </FieldSet>

      <FieldGroup>
        <Controller
          control={form.control}
          name="reason"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="return-reason">Reason</FieldLabel>
              <Select value={field.value ?? ""} onValueChange={field.onChange}>
                <SelectTrigger
                  id="return-reason"
                  className="w-full sm:w-80"
                  aria-invalid={fieldState.invalid}
                >
                  <SelectValue placeholder="Choose a reason" />
                </SelectTrigger>
                <SelectContent>
                  {RETURN_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {RETURN_REASON_LABELS[r]}
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
          name="note"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="return-note">
                {staff ? "Note (optional)" : "Anything the shop should know? (optional)"}
              </FieldLabel>
              <Textarea
                id="return-note"
                rows={3}
                maxLength={1000}
                {...field}
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        {canExchange && (
          <Controller
            control={form.control}
            name="resolution"
            render={({ field }) => (
              <FieldSet>
                <FieldLegend variant="label">What would you like?</FieldLegend>
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="gap-2 sm:grid-cols-2"
                >
                  {(
                    [
                      ["refund", BanknoteIcon, "Refund", "Money back for what was paid."],
                      [
                        "exchange",
                        ArrowLeftRightIcon,
                        "Exchange",
                        "Another size or colour of the same item.",
                      ],
                    ] as const
                  ).map(([value, Icon, title, hint]) => (
                    <label
                      key={value}
                      htmlFor={`resolution-${value}`}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                    >
                      <RadioGroupItem id={`resolution-${value}`} value={value} className="mt-0.5" />
                      <Icon className="mt-0.5 size-4 text-primary" aria-hidden />
                      <span>
                        <span className="block font-medium">{title}</span>
                        <span className="text-muted-foreground">{hint}</span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </FieldSet>
            )}
          />
        )}

        {resolution === "refund" && (options.needsUpi || staff) && (
          <Controller
            control={form.control}
            name="refundUpi"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="return-upi">
                  {staff ? "Customer's UPI id for the refund (optional)" : "UPI id for your refund"}
                </FieldLabel>
                <Input
                  id="return-upi"
                  placeholder="name@okbank"
                  autoComplete="off"
                  inputMode="email"
                  className="sm:w-80"
                  {...field}
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>
                  {staff
                    ? "Cash-on-delivery orders are refunded by UPI or bank transfer."
                    : "You paid on delivery, so we'll send the refund to this UPI id."}
                </FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        )}
      </FieldGroup>

      <FormRootError form={form} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm text-muted-foreground">
          {refundTotal > 0 &&
            (resolution === "refund"
              ? `Refund of about ${formatMoney(refundTotal, currency)} once the items are back.`
              : "Nothing to pay: the replacement is settled against what you paid.")}
        </p>
        <Button type="submit" disabled={isPending}>
          {isPending && <Spinner />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
