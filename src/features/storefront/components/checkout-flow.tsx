"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheckIcon, ShieldCheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { type z } from "zod";

import { FormRootError } from "@/components/shared/form-root-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { routes } from "@/config/routes";
import { INDIAN_STATES } from "@/features/orders/india";
import {
  confirmCheckout,
  resendCheckoutCode,
  startCheckout,
} from "@/features/storefront/checkout-actions";
import { CodeInput } from "@/features/storefront/components/code-input";
import { checkoutDetailsSchema } from "@/features/storefront/schemas";
import { applyActionError } from "@/lib/forms/apply-action-error";
import { formatMoney } from "@/lib/format";

type FormInput = z.input<typeof checkoutDetailsSchema>;
type FormOutput = z.output<typeof checkoutDetailsSchema>;

const RESEND_SECONDS = 30;

export function CheckoutFlow({
  shopSlug,
  currency,
  total,
}: {
  shopSlug: string;
  currency: string;
  total: number;
}) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  return sentTo ? (
    <CodeStep shopSlug={shopSlug} email={sentTo} onChangeDetails={() => setSentTo(null)} />
  ) : (
    <DetailsStep shopSlug={shopSlug} currency={currency} total={total} onSent={setSentTo} />
  );
}

function DetailsStep({
  shopSlug,
  currency,
  total,
  onSent,
}: {
  shopSlug: string;
  currency: string;
  total: number;
  onSent: (email: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(checkoutDetailsSchema),
    defaultValues: {
      shopSlug,
      contact: { name: "", email: "", phone: "" },
      address: { line1: "", line2: "", city: "", state: "", postalCode: "" },
      note: "",
    },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await startCheckout(values);
      if (!result.ok) {
        applyActionError(form, result.error);
        return;
      }
      onSent(result.data.email);
    }),
  );

  const text = (
    name:
      | "contact.name"
      | "contact.email"
      | "contact.phone"
      | "address.line1"
      | "address.line2"
      | "address.city"
      | "address.postalCode"
      | "note",
    label: string,
    props: React.ComponentProps<"input"> = {},
  ) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`co-${name}`}>{label}</FieldLabel>
          <Input
            {...field}
            {...props}
            value={field.value ?? ""}
            id={`co-${name}`}
            aria-invalid={fieldState.invalid}
          />
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
          <CardDescription>We&apos;ll email a code to confirm your order.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              {text("contact.name", "Full name", { autoComplete: "name" })}
            </div>
            {text("contact.email", "Email", {
              type: "email",
              autoComplete: "email",
              inputMode: "email",
            })}
            {text("contact.phone", "Mobile number", {
              type: "tel",
              autoComplete: "tel",
              placeholder: "98765 43210",
            })}
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery address</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {text("address.line1", "House, street, area", { autoComplete: "address-line1" })}
            {text("address.line2", "Landmark (optional)", { autoComplete: "address-line2" })}
            <div className="grid gap-5 sm:grid-cols-3">
              {text("address.city", "City", { autoComplete: "address-level2" })}
              <Controller
                name="address.state"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="co-state">State</FieldLabel>
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="co-state"
                        className="w-full"
                        aria-invalid={fieldState.invalid}
                      >
                        <SelectValue placeholder="Choose" />
                      </SelectTrigger>
                      <SelectContent>
                        {INDIAN_STATES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              {text("address.postalCode", "PIN code", {
                autoComplete: "postal-code",
                inputMode: "numeric",
              })}
            </div>
            {text("note", "Delivery instructions (optional)", {
              placeholder: "Leave with the security guard",
            })}
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <label className="flex items-start gap-3 rounded-xl border border-primary bg-primary/5 p-4">
            <input
              type="radio"
              checked
              readOnly
              className="mt-1 accent-[var(--primary)]"
              name="payment"
            />
            <span>
              <span className="block font-medium">Cash on delivery</span>
              <span className="text-muted-foreground">
                Pay {formatMoney(total, currency)} in cash or UPI to the courier.
              </span>
            </span>
          </label>
          <p className="text-muted-foreground">Online payment is coming soon.</p>
        </CardContent>
      </Card>

      <FormRootError form={form} />
      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending ? <Spinner /> : <MailCheckIcon />}
        Email me a code to place the order
      </Button>
    </form>
  );
}

function CodeStep({
  shopSlug,
  email,
  onChangeDetails,
}: {
  shopSlug: string;
  email: string;
  onChangeDetails: () => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const [isPending, startTransition] = useTransition();
  const [isResending, startResend] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // The input is disabled while checking; once it's enabled again after a
  // wrong code, put the cursor back for another try.
  useEffect(() => {
    if (!isPending && error) inputRef.current?.focus();
  }, [isPending, error]);

  const submit = (value = code) =>
    startTransition(async () => {
      if (!/^\d{6}$/.test(value)) {
        setError("Enter the 6-digit code");
        return;
      }
      const result = await confirmCheckout({ shopSlug, otp: value });
      if (!result.ok) {
        setError(result.error.fieldErrors?.otp?.[0] ?? result.error.message);
        setCode("");
        return;
      }
      toast.success(`Order ${result.data.number} placed`);
      router.replace(routes.storefrontOrder(shopSlug, result.data.token));
    });

  const resend = () =>
    startResend(async () => {
      const result = await resendCheckoutCode({ shopSlug });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      setCooldown(RESEND_SECONDS);
      toast.success("New code sent");
    });

  return (
    <Card>
      <CardHeader className="text-center">
        <ShieldCheckIcon className="mx-auto mb-2 size-8 text-primary" aria-hidden />
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>. It
          expires in 10 minutes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <CodeInput
            id="checkout-code"
            label="Order code"
            inputRef={inputRef}
            value={code}
            onChange={(v) => {
              setCode(v);
              setError(null);
            }}
            onComplete={(v) => submit(v)}
            error={error}
            disabled={isPending}
          />
          <Button type="submit" size="lg" className="w-full" disabled={isPending}>
            {isPending && <Spinner />}
            Place order
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <Button type="button" variant="link" className="px-0" onClick={onChangeDetails}>
              Change details
            </Button>
            <Button
              type="button"
              variant="link"
              className="px-0"
              disabled={cooldown > 0 || isResending}
              onClick={resend}
            >
              {isResending && <Spinner />}
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
