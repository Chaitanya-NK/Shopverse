"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { type z } from "zod";

import { FormRootError } from "@/components/shared/form-root-error";
import { Button } from "@/components/ui/button";
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
import { saveBillingProfile } from "@/features/billing/actions";
import { type BillingProfileInput, billingProfileSchema } from "@/features/billing/schemas";
import { INDIAN_STATES } from "@/features/orders/india";
import { applyActionError } from "@/lib/forms/apply-action-error";

type Values = Omit<BillingProfileInput, "organizationSlug" | "state"> & { state: string };

/** Who Shopverse invoices (owners). */
export function BillingProfileForm({
  organizationSlug,
  profile,
  disabled,
}: {
  organizationSlug: string;
  profile: Values;
  disabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<BillingProfileInput, unknown, z.output<typeof billingProfileSchema>>({
    resolver: zodResolver(billingProfileSchema),
    defaultValues: {
      organizationSlug,
      ...profile,
      state: profile.state as BillingProfileInput["state"],
    },
  });
  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await saveBillingProfile(values);
      if (!result.ok) {
        applyActionError(form, result.error);
        return;
      }
      toast.success("Billing details saved");
      form.reset(values);
    }),
  );

  const text = (
    name: "legalName" | "email" | "gstin" | "line1" | "city" | "postalCode",
    label: string,
    props: React.ComponentProps<"input"> = {},
    hint?: string,
  ) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`billing-${name}`}>{label}</FieldLabel>
          <Input
            id={`billing-${name}`}
            {...field}
            value={field.value ?? ""}
            disabled={disabled}
            aria-invalid={fieldState.invalid}
            {...props}
          />
          {hint && <FieldDescription>{hint}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FieldGroup className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {text("legalName", "Business name on invoices")}
          {text(
            "email",
            "Billing email",
            { type: "email" },
            "Invoices and payment alerts go here.",
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {text(
            "gstin",
            "GSTIN (optional)",
            { placeholder: "29ABCDE1234F1Z5", autoCapitalize: "characters" },
            "Add it to claim input tax credit on our invoices.",
          )}
          <Controller
            name="state"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="billing-state">State</FieldLabel>
                <Select
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  disabled={disabled}
                >
                  <SelectTrigger
                    id="billing-state"
                    className="w-full"
                    aria-invalid={fieldState.invalid}
                  >
                    <SelectValue placeholder="Choose a state" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDIAN_STATES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_8rem]">
          {text("line1", "Address (optional)")}
          {text("city", "City")}
          {text("postalCode", "PIN code", { inputMode: "numeric" })}
        </div>
      </FieldGroup>
      <FormRootError form={form} />
      {!disabled && (
        <Button type="submit" disabled={isPending || !form.formState.isDirty}>
          {isPending && <Spinner />}
          Save billing details
        </Button>
      )}
    </form>
  );
}
