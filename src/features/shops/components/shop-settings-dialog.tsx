"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Settings2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { type z } from "zod";

import { FormRootError } from "@/components/shared/form-root-error";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { updateShop } from "@/features/shops/actions";
import { type ShopSummary } from "@/features/shops/queries";
import { updateShopSchema } from "@/features/shops/schemas";
import { applyActionError } from "@/lib/forms/apply-action-error";

type FormInput = z.input<typeof updateShopSchema>;
type FormOutput = z.output<typeof updateShopSchema>;

const STATUS_COPY = {
  draft: { label: "Draft", hint: "Only your team can preview it." },
  live: { label: "Live", hint: "Anyone can browse and order." },
  paused: { label: "Paused", hint: "Hidden from shoppers; existing orders continue." },
} as const;

const amount = (n: number | null) => (n === null ? "" : String(n));

export function ShopSettingsDialog({
  organizationSlug,
  shop,
}: {
  organizationSlug: string;
  shop: ShopSummary;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`${shop.name} settings`}>
          <Settings2Icon />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{shop.name} settings</DialogTitle>
          <DialogDescription>How the storefront looks and what checkout charges.</DialogDescription>
        </DialogHeader>
        {open && (
          <SettingsForm
            organizationSlug={organizationSlug}
            shop={shop}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SettingsForm({
  organizationSlug,
  shop,
  onDone,
}: {
  organizationSlug: string;
  shop: ShopSummary;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(updateShopSchema),
    defaultValues: {
      organizationSlug,
      shopId: shop.id,
      name: shop.name,
      status: shop.status === "archived" ? "paused" : shop.status,
      settings: {
        tagline: shop.settings.tagline,
        shippingFee: amount(shop.settings.shippingFee),
        freeShippingOver: amount(shop.settings.freeShippingOver),
        codLimit: amount(shop.settings.codLimit),
        supportEmail: shop.settings.supportEmail,
        supportPhone: shop.settings.supportPhone,
      },
    },
  });

  const status = useWatch({ control: form.control, name: "status" });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await updateShop(values);
      if (!result.ok) {
        applyActionError(form, result.error);
        return;
      }
      toast.success(values.status === "live" ? `${values.name} is live` : `${values.name} saved`);
      onDone();
    }),
  );

  const text = (
    name: "name" | "settings.tagline" | "settings.supportEmail" | "settings.supportPhone",
    label: string,
    props: React.ComponentProps<"input"> = {},
  ) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`shop-${name}`}>{label}</FieldLabel>
          <Input
            {...field}
            {...props}
            value={field.value ?? ""}
            id={`shop-${name}`}
            aria-invalid={fieldState.invalid}
          />
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );

  const money = (
    name: "settings.shippingFee" | "settings.freeShippingOver" | "settings.codLimit",
    label: string,
    hint: string,
  ) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`shop-${name}`}>{label}</FieldLabel>
          <Input
            id={`shop-${name}`}
            name={field.name}
            ref={field.ref}
            onBlur={field.onBlur}
            value={String(field.value ?? "")}
            onChange={(e) => field.onChange(e.target.value)}
            inputMode="decimal"
            placeholder="—"
            aria-invalid={fieldState.invalid}
          />
          <FieldDescription>{hint}</FieldDescription>
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
          {text("name", "Shop name")}
          <Controller
            name="status"
            control={form.control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="shop-status">Storefront</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="shop-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_COPY) as (keyof typeof STATUS_COPY)[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_COPY[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>{STATUS_COPY[status].hint}</FieldDescription>
              </Field>
            )}
          />
        </div>
        {text("settings.tagline", "Tagline", { placeholder: "Fresh styles every week" })}

        <FieldSet>
          <FieldLegend variant="label">Checkout</FieldLegend>
          <div className="grid gap-4 sm:grid-cols-3">
            {money("settings.shippingFee", "Shipping fee", "Per order.")}
            {money("settings.freeShippingOver", "Free shipping over", "Leave blank for never.")}
            {money("settings.codLimit", "COD limit", "Largest cash order.")}
          </div>
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">Customer support</FieldLegend>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("settings.supportEmail", "Email", {
              type: "email",
              placeholder: "help@yourshop.in",
            })}
            {text("settings.supportPhone", "Phone / WhatsApp", {
              type: "tel",
              placeholder: "+91 98765 43210",
            })}
          </div>
        </FieldSet>
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
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
