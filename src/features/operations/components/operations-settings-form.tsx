"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailIcon } from "lucide-react";
import { useTransition } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { saveOperationsSettings, sendDigestPreview } from "@/features/operations/actions";
import {
  COURIER_CHOICES,
  hourLabel,
  operationsSettingsSchema,
  RECIPIENT_ROLES,
  ROLE_LABELS,
} from "@/features/operations/schemas";
import { type OperationsSettings } from "@/features/shipping/queries";
import { applyActionError } from "@/lib/forms/apply-action-error";

type FormInput = z.input<typeof operationsSettingsSchema>;
type FormOutput = z.output<typeof operationsSettingsSchema>;

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function OperationsSettingsForm({
  organizationSlug,
  settings,
  canEdit,
}: {
  organizationSlug: string;
  settings: OperationsSettings;
  canEdit: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [isSending, startSending] = useTransition();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(operationsSettingsSchema),
    defaultValues: {
      organizationSlug,
      lowStockAlerts: settings.lowStockAlerts,
      dailyDigest: settings.dailyDigest,
      digestHour: settings.digestHour,
      recipientRoles: settings.recipientRoles,
      courier: settings.courier ?? "none",
    },
  });
  const dailyDigest = useWatch({ control: form.control, name: "dailyDigest" });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await saveOperationsSettings(values);
      if (!result.ok) {
        applyActionError(form, result.error);
        return;
      }
      toast.success("Settings saved");
      form.reset(values);
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <fieldset disabled={!canEdit || isPending} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Email alerts</CardTitle>
            <CardDescription>
              Set a reorder point on items in Inventory; when available stock falls to it, the
              people below get an email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Controller
                name="lowStockAlerts"
                control={form.control}
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Switch
                      id="ops-alerts"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <span>
                      <FieldLabel htmlFor="ops-alerts">Low-stock alerts</FieldLabel>
                      <FieldDescription>One email as soon as items run low.</FieldDescription>
                    </span>
                  </Field>
                )}
              />
              <Controller
                name="dailyDigest"
                control={form.control}
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Switch
                      id="ops-digest"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <span>
                      <FieldLabel htmlFor="ops-digest">Daily digest</FieldLabel>
                      <FieldDescription>
                        Yesterday&apos;s sales and today&apos;s to-do list: orders to pack, returns,
                        low stock and deliveries due from suppliers.
                      </FieldDescription>
                    </span>
                  </Field>
                )}
              />
              {dailyDigest && (
                <Controller
                  name="digestHour"
                  control={form.control}
                  render={({ field }) => (
                    <Field className="max-w-xs">
                      <FieldLabel htmlFor="ops-hour">Send the digest at</FieldLabel>
                      <Select
                        value={String(field.value)}
                        onValueChange={(v) => field.onChange(Number(v))}
                      >
                        <SelectTrigger id="ops-hour" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {HOURS.map((h) => (
                            <SelectItem key={h} value={String(h)}>
                              {hourLabel(h)} India time
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                />
              )}
              <Controller
                name="recipientRoles"
                control={form.control}
                render={({ field, fieldState }) => (
                  <FieldSet data-invalid={fieldState.invalid}>
                    <FieldLegend variant="label">Who gets these emails</FieldLegend>
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                      {RECIPIENT_ROLES.map((role) => (
                        <Field key={role} orientation="horizontal" className="w-auto">
                          <Checkbox
                            id={`ops-role-${role}`}
                            checked={field.value.includes(role)}
                            onCheckedChange={(on) =>
                              field.onChange(
                                on
                                  ? [...field.value, role]
                                  : field.value.filter((r: string) => r !== role),
                              )
                            }
                          />
                          <FieldLabel htmlFor={`ops-role-${role}`} className="font-normal">
                            {ROLE_LABELS[role]}
                          </FieldLabel>
                        </Field>
                      ))}
                    </div>
                    <FieldError errors={[fieldState.error]} />
                  </FieldSet>
                )}
              />
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Courier</CardTitle>
            <CardDescription>
              With a courier on, packed parcels can be booked from the order page: compare rates,
              get an AWB and print the label. Tracking updates then move the parcel along by
              themselves.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Controller
              name="courier"
              control={form.control}
              render={({ field }) => (
                <Field className="max-w-md">
                  <FieldLabel htmlFor="ops-courier">Courier</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="ops-courier" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(COURIER_CHOICES).map(([id, label]) => (
                        <SelectItem key={id} value={id}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    The test courier prices by PIN-code zone and weight like a real one, so you can
                    try the whole flow. Real couriers plug into the same place.
                  </FieldDescription>
                </Field>
              )}
            />
          </CardContent>
        </Card>
      </fieldset>

      <FormRootError form={form} />
      {canEdit && (
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending && <Spinner />}
            Save settings
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isSending}
            onClick={() =>
              startSending(async () => {
                const result = await sendDigestPreview({ organizationSlug });
                if (!result.ok) toast.error(result.error.message);
                else toast.success(`Today's digest sent to ${result.data.to}`);
              })
            }
          >
            {isSending ? <Spinner /> : <MailIcon />}
            Email me today&apos;s digest
          </Button>
        </div>
      )}
    </form>
  );
}
