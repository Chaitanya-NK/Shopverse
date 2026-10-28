"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { DatePicker } from "@/components/shared/date-picker";
import { FormRootError } from "@/components/shared/form-root-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { saveDiscount } from "@/features/discounts/actions";
import {
  DISCOUNT_KINDS,
  type DiscountFormInput,
  type DiscountFormOutput,
  discountFormSchema,
  type DiscountKind,
  type DiscountSummary,
} from "@/features/discounts/schemas";
import { applyActionError } from "@/lib/forms/apply-action-error";

/** The day in India of a moment, for the date pickers ("2026-10-28"). */
const istDayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
const istDay = (iso: string) => istDayFormat.format(new Date(iso));
const asText = (n: number | null) => (n === null ? "" : String(n));

export function DiscountDialog({
  organizationSlug,
  shops,
  discount,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  organizationSlug: string;
  shops: { id: string; name: string }[];
  discount?: DiscountSummary;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{discount ? "Edit discount" : "New discount"}</DialogTitle>
          <DialogDescription>
            One discount applies per order: a code the shopper enters, otherwise the best automatic
            offer.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <DiscountForm
            organizationSlug={organizationSlug}
            shops={shops}
            discount={discount}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DiscountForm({
  organizationSlug,
  shops,
  discount,
  onDone,
}: {
  organizationSlug: string;
  shops: { id: string; name: string }[];
  discount?: DiscountSummary;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<DiscountFormInput, unknown, DiscountFormOutput>({
    resolver: zodResolver(discountFormSchema),
    defaultValues: {
      organizationSlug,
      discountId: discount?.id,
      type: discount && discount.code === null ? "automatic" : "code",
      code: discount?.code ?? "",
      title: discount?.title ?? "",
      kind: discount?.kind ?? "percent",
      value: discount ? asText(discount.kind === "free_shipping" ? null : discount.value) : "",
      maxDiscount: asText(discount?.maxDiscount ?? null),
      minSubtotal: asText(discount?.minSubtotal ?? null),
      startsOn: discount ? istDay(discount.startsAt) : "",
      endsOn: discount?.endsAt ? istDay(discount.endsAt) : "",
      usageLimit: asText(discount?.usageLimit ?? null),
      perCustomerLimit: asText(discount?.perCustomerLimit ?? null),
      firstOrderOnly: discount?.firstOrderOnly ?? false,
      allShops: !discount?.shopIds,
      shopIds: discount?.shopIds ?? [],
      isActive: discount?.isActive ?? true,
    },
  });
  const [type, kind, allShops, startsOn] = useWatch({
    control: form.control,
    name: ["type", "kind", "allShops", "startsOn"],
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await saveDiscount(values);
      if (!result.ok) {
        applyActionError(form, result.error);
        return;
      }
      toast.success(discount ? "Discount saved" : "Discount created");
      onDone();
    }),
  );

  const text = (
    name:
      | "code"
      | "title"
      | "value"
      | "maxDiscount"
      | "minSubtotal"
      | "usageLimit"
      | "perCustomerLimit",
    label: string,
    props: React.ComponentProps<"input"> = {},
    hint?: string,
  ) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`discount-${name}`}>{label}</FieldLabel>
          <Input
            id={`discount-${name}`}
            name={field.name}
            ref={field.ref}
            onBlur={field.onBlur}
            value={String(field.value ?? "")}
            onChange={(e) =>
              field.onChange(name === "code" ? e.target.value.toUpperCase() : e.target.value)
            }
            aria-invalid={fieldState.invalid}
            {...props}
          />
          {hint && <FieldDescription>{hint}</FieldDescription>}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FieldGroup>
        <Controller
          name="type"
          control={form.control}
          render={({ field }) => (
            <Field>
              <FieldLabel>How it applies</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                value={field.value}
                onValueChange={(v) => v && field.onChange(v)}
                className="w-full"
              >
                <ToggleGroupItem value="code" className="flex-1">
                  Shopper enters a code
                </ToggleGroupItem>
                <ToggleGroupItem value="automatic" className="flex-1">
                  Automatic offer
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {type === "code" &&
            text("code", "Code", {
              placeholder: "DIWALI10",
              className: "font-mono uppercase",
              autoComplete: "off",
            })}
          {text(
            "title",
            "Name",
            { placeholder: "Diwali 10% off" },
            type === "automatic" ? "Shown to shoppers in the cart." : "Shown with the code.",
          )}
        </div>

        <Controller
          name="kind"
          control={form.control}
          render={({ field }) => (
            <Field>
              <FieldLabel>Discount</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                value={field.value}
                onValueChange={(v) => v && field.onChange(v)}
                className="w-full"
              >
                {(Object.keys(DISCOUNT_KINDS) as DiscountKind[]).map((k) => (
                  <ToggleGroupItem key={k} value={k} className="flex-1">
                    {DISCOUNT_KINDS[k]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
          )}
        />
        {kind !== "free_shipping" && (
          <div className="grid gap-4 sm:grid-cols-3">
            {text("value", kind === "percent" ? "Percent off" : "Amount off (₹)", {
              inputMode: "decimal",
              placeholder: kind === "percent" ? "10" : "100",
            })}
            {kind === "percent" &&
              text("maxDiscount", "Up to (₹, optional)", {
                inputMode: "decimal",
                placeholder: "No cap",
              })}
            {text("minSubtotal", "Minimum order (₹)", {
              inputMode: "decimal",
              placeholder: "None",
            })}
          </div>
        )}
        {kind === "free_shipping" &&
          text("minSubtotal", "Minimum order (₹)", { inputMode: "decimal", placeholder: "None" })}

        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            name="startsOn"
            control={form.control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="discount-starts">Starts</FieldLabel>
                <DatePicker
                  id="discount-starts"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  placeholder="Now"
                  clearable
                />
              </Field>
            )}
          />
          <Controller
            name="endsOn"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="discount-ends">Ends (end of day)</FieldLabel>
                <DatePicker
                  id="discount-ends"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  min={startsOn || undefined}
                  placeholder="No end date"
                  clearable
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </div>

        <FieldSet>
          <FieldLegend variant="label">Limits</FieldLegend>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("usageLimit", "Total uses", { inputMode: "numeric", placeholder: "Unlimited" })}
            {text("perCustomerLimit", "Uses per customer", {
              inputMode: "numeric",
              placeholder: "Unlimited",
            })}
          </div>
          <Controller
            name="firstOrderOnly"
            control={form.control}
            render={({ field }) => (
              <Field orientation="horizontal">
                <Switch
                  id="discount-first"
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                />
                <FieldLabel htmlFor="discount-first" className="font-normal">
                  First order only (new customers)
                </FieldLabel>
              </Field>
            )}
          />
        </FieldSet>

        {shops.length > 1 && (
          <FieldSet>
            <FieldLegend variant="label">Shops</FieldLegend>
            <Controller
              name="allShops"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Switch
                    id="discount-all-shops"
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                  />
                  <FieldLabel htmlFor="discount-all-shops" className="font-normal">
                    Every shop
                  </FieldLabel>
                </Field>
              )}
            />
            {!allShops && (
              <Controller
                name="shopIds"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {shops.map((shop) => {
                        const checked = (field.value ?? []).includes(shop.id);
                        return (
                          <label key={shop.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) =>
                                field.onChange(
                                  v
                                    ? [...(field.value ?? []), shop.id]
                                    : (field.value ?? []).filter((id) => id !== shop.id),
                                )
                              }
                            />
                            {shop.name}
                          </label>
                        );
                      })}
                    </div>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            )}
          </FieldSet>
        )}

        <Controller
          name="isActive"
          control={form.control}
          render={({ field }) => (
            <Field orientation="horizontal">
              <Switch
                id="discount-active"
                checked={Boolean(field.value)}
                onCheckedChange={field.onChange}
              />
              <FieldLabel htmlFor="discount-active" className="font-normal">
                Active
              </FieldLabel>
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
          {discount ? "Save discount" : "Create discount"}
        </Button>
      </DialogFooter>
    </form>
  );
}
