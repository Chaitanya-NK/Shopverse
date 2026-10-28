"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, CopyIcon, UnplugIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { type z } from "zod";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormRootError } from "@/components/shared/form-root-error";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { disconnectPayments, savePaymentSettings } from "@/features/payments/actions";
import { paymentSettingsSchema, type PaymentSettingsView } from "@/features/payments/schemas";
import { applyActionError } from "@/lib/forms/apply-action-error";

type FormInput = z.input<typeof paymentSettingsSchema>;
type FormOutput = z.output<typeof paymentSettingsSchema>;

export function PaymentSettingsForm({
  organizationSlug,
  settings,
}: {
  organizationSlug: string;
  settings: PaymentSettingsView;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const connected = settings.connected;
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(paymentSettingsSchema),
    defaultValues: {
      organizationSlug,
      keyId: connected ? settings.key_id : "",
      keySecret: "",
      webhookSecret: "",
      enabled: connected ? settings.enabled : true,
    },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      if (!connected && !values.keySecret) {
        form.setError("keySecret", { message: "Enter the key secret" });
        return;
      }
      const result = await savePaymentSettings(values);
      if (!result.ok) {
        applyActionError(form, result.error);
        return;
      }
      toast.success(
        result.data.mode === "live"
          ? "Razorpay connected in live mode"
          : "Razorpay connected in test mode",
      );
      form.reset({ ...values, keySecret: "", webhookSecret: "" });
    }),
  );

  const secret = (
    name: "keySecret" | "webhookSecret",
    label: string,
    hint: string,
    saved: boolean,
  ) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`pay-${name}`}>{label}</FieldLabel>
          <Input
            {...field}
            value={field.value ?? ""}
            id={`pay-${name}`}
            type="password"
            autoComplete="off"
            placeholder={saved ? "Saved. Leave blank to keep it" : ""}
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
        <Controller
          name="keyId"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="pay-keyId">Key id</FieldLabel>
              <Input
                {...field}
                id="pay-keyId"
                autoComplete="off"
                className="font-mono"
                placeholder="rzp_test_…"
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>
                Use test keys first; switch to live keys when you&apos;re ready.
              </FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        {secret(
          "keySecret",
          "Key secret",
          "Shown once in Razorpay when you generate the key.",
          connected,
        )}
        {secret(
          "webhookSecret",
          "Webhook secret",
          "The secret you set on the webhook below. It confirms payments even if the shopper closes the page.",
          connected && settings.webhook_configured,
        )}
        <Controller
          name="enabled"
          control={form.control}
          render={({ field }) => (
            <Field orientation="horizontal">
              <Switch
                id="pay-enabled"
                checked={field.value ?? true}
                onCheckedChange={field.onChange}
              />
              <FieldLabel htmlFor="pay-enabled" className="font-normal">
                Accept online payments in my shops
              </FieldLabel>
            </Field>
          )}
        />
      </FieldGroup>
      <FormRootError form={form} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending && <Spinner />}
          {connected ? "Save and check keys" : "Connect Razorpay"}
        </Button>
        {connected && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <UnplugIcon />
            Disconnect
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Disconnect Razorpay?"
        description="Shoppers won't be able to pay online. Orders already paid aren't affected, but refunds can't be sent until you connect again."
        confirmLabel="Disconnect"
        onConfirm={async () => {
          const result = await disconnectPayments({ organizationSlug });
          if (!result.ok) {
            toast.error(result.error.message);
            return false;
          }
          toast.success("Razorpay disconnected");
          form.reset({
            organizationSlug,
            keyId: "",
            keySecret: "",
            webhookSecret: "",
            enabled: true,
          });
          return true;
        }}
      />
    </form>
  );
}

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Input
        readOnly
        value={value}
        aria-label={label}
        className="font-mono text-xs"
        onFocus={(e) => e.target.select()}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Copy ${label}`}
        onClick={() => {
          void navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  );
}
