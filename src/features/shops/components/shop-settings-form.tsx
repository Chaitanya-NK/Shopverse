"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { type z } from "zod";

import { FormRootError } from "@/components/shared/form-root-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { routes } from "@/config/routes";
import { INDIAN_STATES } from "@/features/orders/india";
import { updateShop } from "@/features/shops/actions";
import { type ShopSummary } from "@/features/shops/queries";
import { POLICY_PAGES, type PolicyPage, updateShopSchema } from "@/features/shops/schemas";
import { applyActionError } from "@/lib/forms/apply-action-error";

type FormInput = z.input<typeof updateShopSchema>;
type FormOutput = z.output<typeof updateShopSchema>;
type TextPath =
  | "name"
  | "settings.tagline"
  | "settings.supportEmail"
  | "settings.supportPhone"
  | "settings.legalName"
  | "settings.gstin"
  | "settings.businessAddress.line1"
  | "settings.businessAddress.city"
  | "settings.businessAddress.postalCode";
type MoneyPath = "settings.shippingFee" | "settings.freeShippingOver" | "settings.codLimit";

const STATUS_COPY = {
  draft: { label: "Draft", hint: "Only your team can preview it." },
  live: { label: "Live", hint: "Anyone can browse and order." },
  paused: { label: "Paused", hint: "Hidden from shoppers; existing orders continue." },
} as const;

const POLICY_HINTS: Record<PolicyPage, string> = {
  shipping: "Where you deliver, how long it takes, delivery charges.",
  returns: "Whether and how customers can return or exchange, and how refunds work.",
  privacy: "What customer data you collect and how you use it.",
  terms: "The terms that apply when someone buys from you.",
};

const amount = (n: number | null) => (n === null ? "" : String(n));

export function ShopSettingsForm({
  organizationSlug,
  shop,
  paymentsConnected,
}: {
  organizationSlug: string;
  shop: ShopSummary;
  /** Whether the business has an enabled Razorpay account. */
  paymentsConnected: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const s = shop.settings;
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(updateShopSchema),
    defaultValues: {
      organizationSlug,
      shopId: shop.id,
      name: shop.name,
      status: shop.status === "archived" ? "paused" : shop.status,
      settings: {
        ...s,
        shippingFee: amount(s.shippingFee),
        freeShippingOver: amount(s.freeShippingOver),
        codLimit: amount(s.codLimit),
      },
    },
  });
  const status = useWatch({ control: form.control, name: "status" });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await updateShop(values);
      if (!result.ok) {
        applyActionError(form, result.error);
        toast.error(result.error.message);
        return;
      }
      toast.success(
        values.status === "live" && shop.status !== "live"
          ? `${values.name} is live`
          : "Settings saved",
      );
      form.reset(values);
      router.refresh();
    }),
  );

  const text = (
    name: TextPath,
    label: string,
    props: React.ComponentProps<"input"> = {},
    hint?: string,
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
          {hint && <FieldDescription>{hint}</FieldDescription>}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );

  const money = (name: MoneyPath, label: string, hint: string) => (
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
    <form onSubmit={onSubmit} noValidate className="space-y-6 pb-24">
      <Card>
        <CardHeader>
          <CardTitle>Storefront</CardTitle>
          <CardDescription>
            Your shop lives at{" "}
            <span className="font-mono text-foreground">{routes.storefront(shop.slug)}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
              {text("name", "Shop name")}
              <Controller
                name="status"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="shop-status">Status</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="shop-status" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(STATUS_COPY) as (keyof typeof STATUS_COPY)[]).map((k) => (
                          <SelectItem key={k} value={k}>
                            {STATUS_COPY[k].label}
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
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Checkout</CardTitle>
          <CardDescription>What delivery costs and how large a cash order can be.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {money("settings.shippingFee", "Delivery fee", "Per order.")}
            {money("settings.freeShippingOver", "Free delivery over", "Leave blank for never.")}
            {money("settings.codLimit", "Cash on delivery limit", "Largest cash order.")}
          </div>
          <FieldSet className="mt-6">
            <FieldLegend variant="label">Ways to pay</FieldLegend>
            <FieldGroup className="gap-4">
              <Controller
                name="settings.acceptOnline"
                control={form.control}
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Switch
                      id="shop-accept-online"
                      checked={field.value ?? true}
                      onCheckedChange={field.onChange}
                    />
                    <span>
                      <FieldLabel htmlFor="shop-accept-online">
                        Online (UPI, cards, net banking)
                      </FieldLabel>
                      <FieldDescription>
                        {paymentsConnected ? (
                          "Through your connected Razorpay account."
                        ) : (
                          <>
                            Offered once you connect Razorpay in{" "}
                            <Link
                              href={routes.orgPayments(organizationSlug)}
                              className="underline underline-offset-4"
                            >
                              Payments
                            </Link>
                            .
                          </>
                        )}
                      </FieldDescription>
                    </span>
                  </Field>
                )}
              />
              <Controller
                name="settings.acceptCod"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field orientation="horizontal" data-invalid={fieldState.invalid}>
                    <Switch
                      id="shop-accept-cod"
                      checked={field.value ?? true}
                      onCheckedChange={field.onChange}
                    />
                    <span>
                      <FieldLabel htmlFor="shop-accept-cod">Cash on delivery</FieldLabel>
                      <FieldDescription>Up to the limit above.</FieldDescription>
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </span>
                  </Field>
                )}
              />
            </FieldGroup>
          </FieldSet>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Customer contact</CardTitle>
          <CardDescription>
            Shown in your shop&apos;s footer, on orders and in emails.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              {text(
                "settings.supportEmail",
                "Support email",
                {
                  type: "email",
                  placeholder: "help@yourshop.in",
                },
                "Customers' replies to order emails come here.",
              )}
              {text("settings.supportPhone", "Phone / WhatsApp", {
                type: "tel",
                placeholder: "+91 98765 43210",
              })}
            </div>
            <Controller
              name="settings.notifyCustomers"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Switch
                    id="shop-notify"
                    checked={field.value ?? true}
                    onCheckedChange={field.onChange}
                  />
                  <span>
                    <FieldLabel htmlFor="shop-notify">
                      Email customers about their orders
                    </FieldLabel>
                    <FieldDescription>
                      Confirmation, shipped, out for delivery (with the delivery code), delivered
                      and cancelled. Codes for checkout and sign-in are always sent.
                    </FieldDescription>
                  </span>
                </Field>
              )}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Business details</CardTitle>
          <CardDescription>
            Printed on invoices. Leave GSTIN blank if you aren&apos;t registered for GST. Invoices
            already issued keep the details they were issued with.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              {text("settings.legalName", "Registered business name", {
                placeholder: "Urban Threads Retail Pvt Ltd",
              })}
              {text("settings.gstin", "GSTIN", {
                placeholder: "29ABCDE1234F1Z5",
                autoCapitalize: "characters",
                className: "font-mono uppercase",
              })}
            </div>
            {text("settings.businessAddress.line1", "Registered address", {
              placeholder: "Building, street, area",
            })}
            <div className="grid gap-4 sm:grid-cols-3">
              {text("settings.businessAddress.city", "City")}
              <Controller
                name="settings.businessAddress.state"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="shop-biz-state">State</FieldLabel>
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="shop-biz-state"
                        className="w-full"
                        aria-invalid={fieldState.invalid}
                      >
                        <SelectValue placeholder="Choose" />
                      </SelectTrigger>
                      <SelectContent>
                        {INDIAN_STATES.map((st) => (
                          <SelectItem key={st} value={st}>
                            {st}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              {text("settings.businessAddress.postalCode", "PIN code", { inputMode: "numeric" })}
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Policy pages</CardTitle>
          <CardDescription>
            Linked from your shop&apos;s footer. Plain text; blank lines start a new paragraph.
            Pages left empty aren&apos;t shown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {(Object.keys(POLICY_PAGES) as PolicyPage[]).map((page) => (
              <Controller
                key={page}
                name={`settings.policies.${page}`}
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`shop-policy-${page}`}>
                      {POLICY_PAGES[page].title}
                    </FieldLabel>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      id={`shop-policy-${page}`}
                      rows={5}
                      className="max-h-96"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldDescription>{POLICY_HINTS[page]}</FieldDescription>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            ))}
          </FieldGroup>
        </CardContent>
      </Card>

      <FormRootError form={form} />
      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        {form.formState.isDirty && (
          <span className="mr-auto text-sm text-muted-foreground">You have unsaved changes</span>
        )}
        <Button type="submit" disabled={isPending}>
          {isPending && <Spinner />}
          Save settings
        </Button>
      </div>
    </form>
  );
}
