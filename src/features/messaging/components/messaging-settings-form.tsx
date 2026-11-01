"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { SendIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { type z } from "zod";

import { FormRootError } from "@/components/shared/form-root-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { saveMessagingSettings, sendTestMessage } from "@/features/messaging/actions";
import {
  messagingSettingsSchema,
  type MessagingSettingsView,
  PROVIDERS,
} from "@/features/messaging/schemas";
import { MESSAGE_EVENT_IDS, MESSAGE_EVENTS } from "@/features/messaging/templates";
import { applyActionError } from "@/lib/forms/apply-action-error";

type FormInput = z.input<typeof messagingSettingsSchema>;
type FormOutput = z.output<typeof messagingSettingsSchema>;

export function MessagingSettingsForm({
  organizationSlug,
  settings,
}: {
  organizationSlug: string;
  settings: MessagingSettingsView;
}) {
  const [isPending, startTransition] = useTransition();
  const c = settings.connected ? settings : null;
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(messagingSettingsSchema),
    defaultValues: {
      organizationSlug,
      provider: c?.provider ?? "off",
      channel: c?.channel ?? "whatsapp",
      accountSid: c?.account_sid ?? "",
      authToken: "",
      sender: c?.sender ?? "",
      events: c?.events ?? ["confirmed", "shipped", "out_for_delivery", "delivered"],
      enabled: c?.enabled ?? true,
    },
  });
  const provider = useWatch({ control: form.control, name: "provider" });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await saveMessagingSettings(values);
      if (!result.ok) {
        applyActionError(form, result.error);
        return;
      }
      toast.success(values.provider === "off" ? "Messaging turned off" : "Messaging saved");
      form.reset({ ...values, authToken: "" });
    }),
  );

  const text = (
    name: "accountSid" | "authToken" | "sender",
    label: string,
    hint: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`msg-${name}`}>{label}</FieldLabel>
          <Input
            id={`msg-${name}`}
            {...field}
            value={field.value ?? ""}
            autoComplete="off"
            aria-invalid={fieldState.invalid}
            {...props}
          />
          <FieldDescription>{hint}</FieldDescription>
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Provider</CardTitle>
          <CardDescription>
            Customers who tick &ldquo;Send me order updates&rdquo; at checkout get these messages as
            well as the emails.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Controller
              name="provider"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="msg-provider">Send messages with</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="msg-provider" className="w-full max-w-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PROVIDERS).map(([id, label]) => (
                        <SelectItem key={id} value={id}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
            {provider !== "off" && (
              <Controller
                name="channel"
                control={form.control}
                render={({ field }) => (
                  <FieldSet>
                    <FieldLegend variant="label">Channel</FieldLegend>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="flex gap-6"
                    >
                      {(["whatsapp", "sms"] as const).map((ch) => (
                        <Field key={ch} orientation="horizontal" className="w-auto">
                          <RadioGroupItem id={`msg-ch-${ch}`} value={ch} />
                          <FieldLabel htmlFor={`msg-ch-${ch}`} className="font-normal">
                            {ch === "whatsapp" ? "WhatsApp" : "SMS"}
                          </FieldLabel>
                        </Field>
                      ))}
                    </RadioGroup>
                  </FieldSet>
                )}
              />
            )}
            {provider === "twilio" && (
              <div className="grid gap-4 sm:grid-cols-2">
                {text("accountSid", "Account SID", "From the Twilio Console home page.", {
                  className: "font-mono",
                  placeholder: "AC…",
                })}
                {text(
                  "authToken",
                  "Auth token",
                  c?.token_saved ? "Saved. Leave blank to keep it." : "Next to the Account SID.",
                  { type: "password", placeholder: c?.token_saved ? "Saved" : "" },
                )}
                {text(
                  "sender",
                  "Send from",
                  "Your Twilio number, or the WhatsApp sandbox number (+14155238886).",
                  { inputMode: "tel", placeholder: "+14155238886" },
                )}
              </div>
            )}
          </FieldGroup>
        </CardContent>
      </Card>

      {provider !== "off" && (
        <Card>
          <CardHeader>
            <CardTitle>Which updates</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Controller
                name="events"
                control={form.control}
                render={({ field, fieldState }) => (
                  <FieldSet data-invalid={fieldState.invalid}>
                    <FieldLegend variant="label" className="sr-only">
                      Updates
                    </FieldLegend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {MESSAGE_EVENT_IDS.map((id) => (
                        <Field key={id} orientation="horizontal">
                          <Checkbox
                            id={`msg-ev-${id}`}
                            checked={field.value.includes(id)}
                            onCheckedChange={(on) =>
                              field.onChange(
                                on ? [...field.value, id] : field.value.filter((e) => e !== id),
                              )
                            }
                          />
                          <FieldLabel htmlFor={`msg-ev-${id}`} className="font-normal">
                            {MESSAGE_EVENTS[id]}
                          </FieldLabel>
                        </Field>
                      ))}
                    </div>
                  </FieldSet>
                )}
              />
              <Controller
                name="enabled"
                control={form.control}
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Switch
                      id="msg-enabled"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <FieldLabel htmlFor="msg-enabled" className="font-normal">
                      Offer updates at checkout and send them
                    </FieldLabel>
                  </Field>
                )}
              />
            </FieldGroup>
          </CardContent>
        </Card>
      )}

      <FormRootError form={form} />
      <Button type="submit" disabled={isPending}>
        {isPending && <Spinner />}
        {provider === "twilio" ? "Save and check keys" : "Save"}
      </Button>
    </form>
  );
}

export function TestMessage({ organizationSlug }: { organizationSlug: string }) {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await sendTestMessage({ organizationSlug, phone });
          if (!result.ok) {
            setError(result.error.fieldErrors?.phone?.[0] ?? result.error.message);
            return;
          }
          setError(null);
          toast.success(`Test message sent to ${result.data.to}`);
        });
      }}
    >
      <Field data-invalid={Boolean(error)} className="w-64">
        <FieldLabel htmlFor="msg-test-phone">Send a test to</FieldLabel>
        <Input
          id="msg-test-phone"
          type="tel"
          inputMode="tel"
          placeholder="98765 43210"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-invalid={Boolean(error)}
        />
        {error && <FieldError>{error}</FieldError>}
      </Field>
      <Button type="submit" variant="outline" disabled={isPending}>
        {isPending ? <Spinner /> : <SendIcon />}
        Send test
      </Button>
    </form>
  );
}
