"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailIcon, ShieldCheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { type z } from "zod";

import { FormRootError } from "@/components/shared/form-root-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { RETURN_TO_PARAM, routes } from "@/config/routes";
import {
  resendShopperSignIn,
  startShopperSignIn,
  verifyShopperSignIn,
} from "@/features/shopper/actions";
import { signInEmailSchema } from "@/features/shopper/schemas";
import { CodeInput } from "@/features/storefront/components/code-input";
import { applyActionError } from "@/lib/forms/apply-action-error";

const RESEND_SECONDS = 30;

export function SignInFlow({
  shopSlug,
  shopName,
  returnTo,
}: {
  shopSlug: string;
  shopName: string;
  /** Already validated as a same-origin path. */
  returnTo: string;
}) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  return sentTo ? (
    <CodeStep
      shopSlug={shopSlug}
      email={sentTo}
      returnTo={returnTo}
      onChangeEmail={() => setSentTo(null)}
    />
  ) : (
    <EmailStep shopSlug={shopSlug} shopName={shopName} onSent={setSentTo} />
  );
}

function EmailStep({
  shopSlug,
  shopName,
  onSent,
}: {
  shopSlug: string;
  shopName: string;
  onSent: (email: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<
    z.input<typeof signInEmailSchema>,
    unknown,
    z.output<typeof signInEmailSchema>
  >({
    resolver: zodResolver(signInEmailSchema),
    defaultValues: { shopSlug, email: "" },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await startShopperSignIn(values);
      if (!result.ok) {
        applyActionError(form, result.error);
        return;
      }
      onSent(result.data.email);
    }),
  );

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Sign in to {shopName}</CardTitle>
        <CardDescription>
          Track orders, save addresses and check out faster. No password needed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="shopper-email">Email</FieldLabel>
                <Input
                  {...field}
                  id="shopper-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoFocus
                  placeholder="you@example.com"
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>
                  New here? The same code creates your account. Orders you placed with this email
                  will be there.
                </FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <FormRootError form={form} />
          <Button type="submit" size="lg" className="w-full" disabled={isPending}>
            {isPending ? <Spinner /> : <MailIcon />}
            Email me a code
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CodeStep({
  shopSlug,
  email,
  returnTo,
  onChangeEmail,
}: {
  shopSlug: string;
  email: string;
  returnTo: string;
  onChangeEmail: () => void;
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

  useEffect(() => {
    if (!isPending && error) inputRef.current?.focus();
  }, [isPending, error]);

  const submit = (value = code) =>
    startTransition(async () => {
      if (!/^\d{6}$/.test(value)) {
        setError("Enter the 6-digit code");
        return;
      }
      const result = await verifyShopperSignIn({ shopSlug, code: value });
      if (!result.ok) {
        setError(result.error.fieldErrors?.code?.[0] ?? result.error.message);
        setCode("");
        return;
      }
      toast.success("You're signed in");
      // New shoppers add their name first; everyone else goes where they were headed.
      router.replace(
        result.data.needsName
          ? `${routes.storefrontProfile(shopSlug)}?welcome=1&${RETURN_TO_PARAM}=${encodeURIComponent(returnTo)}`
          : returnTo,
      );
      router.refresh();
    });

  const resend = () =>
    startResend(async () => {
      const result = await resendShopperSignIn({ shopSlug });
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
        <CardTitle className="text-xl">Check your email</CardTitle>
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
            id="sign-in-code"
            label="Sign-in code"
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
            Sign in
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <Button type="button" variant="link" className="px-0" onClick={onChangeEmail}>
              Use a different email
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
