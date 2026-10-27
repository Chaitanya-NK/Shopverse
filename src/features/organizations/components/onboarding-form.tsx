"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { FormRootError } from "@/components/shared/form-root-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { createOrganization } from "@/features/organizations/actions";
import { IndustryPicker } from "@/features/organizations/components/industry-picker";
import {
  type CreateOrganizationInput,
  createOrganizationSchema,
  SUPPORTED_CURRENCIES,
} from "@/features/organizations/schemas";
import { applyActionError } from "@/lib/forms/apply-action-error";
import { slugify } from "@/lib/slug";

export function OnboardingForm({ defaultName }: { defaultName?: string }) {
  const [isPending, startTransition] = useTransition();
  // Auto-fill the slug and shop name from the business name until the user edits them.
  const [slugTouched, setSlugTouched] = useState(false);
  const [shopTouched, setShopTouched] = useState(false);

  const form = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: {
      organizationName: defaultName ?? "",
      organizationSlug: defaultName ? slugify(defaultName) : "",
      shopName: defaultName ?? "",
      currency: "INR",
      warehouseName: "Main warehouse",
      warehouseCity: "",
      industries: [],
    },
  });

  const organizationSlug = useWatch({ control: form.control, name: "organizationSlug" });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await createOrganization(values);
      if (result && !result.ok) applyActionError(form, result.error);
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardContent>
          <FieldGroup>
            <FieldSet>
              <FieldLegend>Your business</FieldLegend>
              <FieldDescription>
                The company that owns your shops. You can rename it later.
              </FieldDescription>
              <FieldGroup>
                <Controller
                  name="organizationName"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="org-name">Business name</FieldLabel>
                      <Input
                        {...field}
                        id="org-name"
                        autoFocus
                        placeholder="Acme Retail"
                        aria-invalid={fieldState.invalid}
                        onChange={(e) => {
                          field.onChange(e);
                          if (!slugTouched) {
                            form.setValue("organizationSlug", slugify(e.target.value), {
                              shouldValidate: false,
                            });
                          }
                          if (!shopTouched) form.setValue("shopName", e.target.value);
                        }}
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
                <Controller
                  name="organizationSlug"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="org-slug">Workspace URL</FieldLabel>
                      <InputGroup>
                        <InputGroupAddon>
                          <InputGroupText>tradeloom.app/</InputGroupText>
                        </InputGroupAddon>
                        <InputGroupInput
                          {...field}
                          id="org-slug"
                          autoCapitalize="none"
                          spellCheck={false}
                          aria-invalid={fieldState.invalid}
                          onChange={(e) => {
                            setSlugTouched(true);
                            field.onChange(e.target.value.toLowerCase());
                          }}
                        />
                      </InputGroup>
                      <FieldDescription>
                        Your team will sign in at tradeloom.app/
                        {organizationSlug || "your-business"}.
                      </FieldDescription>
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
              </FieldGroup>
            </FieldSet>

            <FieldSeparator />

            <Controller
              name="industries"
              control={form.control}
              render={({ field, fieldState }) => (
                <FieldSet data-invalid={fieldState.invalid}>
                  <FieldLegend>What do you sell?</FieldLegend>
                  <FieldDescription>
                    Pick everything that applies. We&apos;ll set up categories with the right
                    product details and stock tracking for each: sizes for clothing, IMEI numbers
                    for phones, expiry dates for food.
                  </FieldDescription>
                  <IndustryPicker
                    value={field.value}
                    onChange={field.onChange}
                    invalid={fieldState.invalid}
                    disabled={isPending}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </FieldSet>
              )}
            />

            <FieldSeparator />

            <FieldSet>
              <FieldLegend>Your first shop</FieldLegend>
              <FieldDescription>
                Each shop gets its own storefront, catalogue and prices.
              </FieldDescription>
              <FieldGroup className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <Controller
                  name="shopName"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="shop-name">Shop name</FieldLabel>
                      <Input
                        {...field}
                        id="shop-name"
                        placeholder="Acme Store"
                        aria-invalid={fieldState.invalid}
                        onChange={(e) => {
                          setShopTouched(true);
                          field.onChange(e);
                        }}
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
                <Controller
                  name="currency"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="shop-currency">Currency</FieldLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger
                          id="shop-currency"
                          className="w-full"
                          aria-invalid={fieldState.invalid}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SUPPORTED_CURRENCIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
              </FieldGroup>
            </FieldSet>

            <FieldSeparator />

            <FieldSet>
              <FieldLegend>Your first warehouse</FieldLegend>
              <FieldDescription>
                Where stock is held and orders ship from. Add more any time.
              </FieldDescription>
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <Controller
                  name="warehouseName"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="wh-name">Warehouse name</FieldLabel>
                      <Input {...field} id="wh-name" aria-invalid={fieldState.invalid} />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
                <Controller
                  name="warehouseCity"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="wh-city">City</FieldLabel>
                      <Input
                        {...field}
                        id="wh-city"
                        autoComplete="address-level2"
                        placeholder="Bengaluru"
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
              </FieldGroup>
            </FieldSet>

            <FormRootError form={form} />
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end border-t">
          <Button type="submit" size="lg" disabled={isPending}>
            {isPending && <Spinner />}
            Create workspace
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
