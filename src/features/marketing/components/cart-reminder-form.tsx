"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { type z } from "zod";

import { FormRootError } from "@/components/shared/form-root-error";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { saveCartReminderSettings } from "@/features/marketing/actions";
import { cartReminderSettingsSchema, REMINDER_DELAYS } from "@/features/marketing/schemas";
import { applyActionError } from "@/lib/forms/apply-action-error";

type FormInput = z.input<typeof cartReminderSettingsSchema>;
type FormOutput = z.output<typeof cartReminderSettingsSchema>;

export function CartReminderForm({
  organizationSlug,
  shop,
}: {
  organizationSlug: string;
  shop: {
    id: string;
    name: string;
    reminders: { enabled: boolean; hours: number; code: string | null };
  };
}) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(cartReminderSettingsSchema),
    defaultValues: {
      organizationSlug,
      shopId: shop.id,
      enabled: shop.reminders.enabled,
      delayHours: shop.reminders.hours,
      code: shop.reminders.code ?? "",
    },
  });
  const enabled = useWatch({ control: form.control, name: "enabled" });
  const id = (k: string) => `cart-${shop.id}-${k}`;

  return (
    <form
      noValidate
      className="space-y-4 rounded-lg border p-4"
      onSubmit={form.handleSubmit((values) =>
        startTransition(async () => {
          const result = await saveCartReminderSettings(values);
          if (!result.ok) {
            applyActionError(form, result.error);
            return;
          }
          toast.success(`Cart reminders saved for ${shop.name}`);
          form.reset(values);
        }),
      )}
    >
      <Controller
        name="enabled"
        control={form.control}
        render={({ field }) => (
          <Field orientation="horizontal">
            <Switch id={id("on")} checked={field.value} onCheckedChange={field.onChange} />
            <span>
              <FieldLabel htmlFor={id("on")}>{shop.name}</FieldLabel>
              <FieldDescription>Remind shoppers who leave without ordering.</FieldDescription>
            </span>
          </Field>
        )}
      />
      {enabled && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            name="delayHours"
            control={form.control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor={id("delay")}>Send after</FieldLabel>
                <Select
                  value={String(field.value)}
                  onValueChange={(v) => field.onChange(Number(v))}
                >
                  <SelectTrigger id={id("delay")} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REMINDER_DELAYS.map((h) => (
                      <SelectItem key={h} value={String(h)}>
                        {h === 1 ? "1 hour" : `${h} hours`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
          <Controller
            name="code"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={id("code")}>Discount code (optional)</FieldLabel>
                <Input
                  id={id("code")}
                  {...field}
                  value={field.value ?? ""}
                  className="font-mono uppercase"
                  placeholder="COMEBACK10"
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>
                  An active code from Discounts, offered in the email.
                </FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </div>
      )}
      <FormRootError form={form} />
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending && <Spinner />}
        Save
      </Button>
    </form>
  );
}
