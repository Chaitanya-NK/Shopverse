"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PackageCheckIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormRootError } from "@/components/shared/form-root-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { routes } from "@/config/routes";
import { placeSignedInOrder } from "@/features/shopper/actions";
import { AddressFields } from "@/features/shopper/components/address-fields";
import { addressSchema, formatAddressLine, type SavedAddress } from "@/features/shopper/schemas";
import { applyActionError } from "@/lib/forms/apply-action-error";
import { formatMoney } from "@/lib/format";

const NEW = "new";
const newAddressSchema = addressSchema.omit({ label: true, isDefault: true });

// The new-address fields only count when "new address" is chosen.
const formSchema = z
  .object({
    addressId: z.string(),
    address: z.object({
      name: z.string(),
      phone: z.string(),
      line1: z.string(),
      line2: z.string(),
      city: z.string(),
      state: z.string(),
      postalCode: z.string(),
    }),
    saveAddress: z.boolean(),
    note: z.string().trim().max(300, "Keep it under 300 characters"),
  })
  .superRefine((value, ctx) => {
    if (value.addressId !== NEW) return;
    const parsed = newAddressSchema.safeParse(value.address);
    if (parsed.success) return;
    for (const issue of parsed.error.issues)
      ctx.addIssue({ code: "custom", message: issue.message, path: ["address", ...issue.path] });
  });
type FormValues = z.infer<typeof formSchema>;

export function SignedInCheckout({
  shopSlug,
  currency,
  total,
  email,
  name,
  phone,
  addresses,
}: {
  shopSlug: string;
  currency: string;
  total: number;
  email: string;
  name: string | null;
  phone: string | null;
  addresses: SavedAddress[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // One id per visit to checkout: a retry or double click can't order twice.
  const [requestId] = useState(() => crypto.randomUUID());
  const fallback = addresses.find((a) => a.isDefault) ?? addresses[0];

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      addressId: fallback?.id ?? NEW,
      address: {
        name: name ?? "",
        phone: phone?.replace(/^\+91/, "") ?? "",
        line1: "",
        line2: "",
        city: "",
        state: "",
        postalCode: "",
      },
      saveAddress: true,
      note: "",
    },
  });
  const addressId = useWatch({ control: form.control, name: "addressId" });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const isNew = values.addressId === NEW;
      const result = await placeSignedInOrder({
        shopSlug,
        requestId,
        addressId: isNew ? "" : values.addressId,
        address: isNew ? values.address : undefined,
        saveAddress: isNew && values.saveAddress,
        note: values.note,
      });
      if (!result.ok) {
        applyActionError(form, result.error);
        if (result.error.code === "UNAUTHENTICATED") router.refresh();
        return;
      }
      toast.success(`Order ${result.data.number} placed`);
      router.replace(routes.storefrontOrder(shopSlug, result.data.token));
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Deliver to</CardTitle>
          <CardDescription>
            Order updates go to <span className="font-medium text-foreground">{email}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Controller
            name="addressId"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel className="sr-only">Delivery address</FieldLabel>
                <RadioGroup value={field.value} onValueChange={field.onChange} className="gap-2">
                  {addresses.map((a) => (
                    <label
                      key={a.id}
                      htmlFor={`addr-${a.id}`}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                    >
                      <RadioGroupItem id={`addr-${a.id}`} value={a.id} className="mt-0.5" />
                      <span className="min-w-0 space-y-0.5">
                        <span className="flex flex-wrap items-center gap-2 font-medium">
                          {a.name}
                          {a.label && <Badge variant="secondary">{a.label}</Badge>}
                        </span>
                        <span className="block text-muted-foreground">{formatAddressLine(a)}</span>
                        <span className="block text-muted-foreground">{a.phone}</span>
                      </span>
                    </label>
                  ))}
                  <label
                    htmlFor="addr-new"
                    className="flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                  >
                    <RadioGroupItem id="addr-new" value={NEW} />
                    <PlusIcon className="size-4" aria-hidden />
                    <span className="font-medium">
                      {addresses.length ? "Deliver to a new address" : "Add your address"}
                    </span>
                  </label>
                </RadioGroup>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          {addressId === NEW && (
            <FieldGroup>
              <AddressFields control={form.control} prefix="address" idPrefix="co-new" />
              <Controller
                name="saveAddress"
                control={form.control}
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Checkbox
                      id="co-save"
                      checked={field.value}
                      onCheckedChange={(v) => field.onChange(v === true)}
                    />
                    <FieldLabel htmlFor="co-save" className="font-normal">
                      Save this address for next time
                    </FieldLabel>
                  </Field>
                )}
              />
            </FieldGroup>
          )}

          <Controller
            name="note"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="co-note">Delivery instructions (optional)</FieldLabel>
                <Input
                  {...field}
                  id="co-note"
                  placeholder="Leave with the security guard"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-start gap-3 rounded-xl border border-primary bg-primary/5 p-4">
            <PackageCheckIcon className="mt-0.5 size-4 text-primary" aria-hidden />
            <span>
              <span className="block font-medium">Cash on delivery</span>
              <span className="text-muted-foreground">
                Pay {formatMoney(total, currency)} in cash or UPI to the courier.
              </span>
            </span>
          </div>
          <p className="text-muted-foreground">Online payment is coming soon.</p>
        </CardContent>
      </Card>

      <FormRootError form={form} />
      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending && <Spinner />}
        Place order · {formatMoney(total, currency)}
      </Button>
    </form>
  );
}
