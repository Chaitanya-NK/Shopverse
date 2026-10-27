"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormRootError } from "@/components/shared/form-root-error";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { routes } from "@/config/routes";
import { resendCode, verifyCode } from "@/features/auth/actions";
import { OTP_LENGTH, OTP_RESEND_COOLDOWN_SECONDS } from "@/features/auth/constants";
import { type VerifyOtpInput, verifyOtpSchema } from "@/features/auth/schemas";
import { applyActionError } from "@/lib/forms/apply-action-error";

type VerifyOtpFormProps = { next?: string };

export function VerifyOtpForm({ next }: VerifyOtpFormProps) {
  const [isVerifying, startVerify] = useTransition();
  const [isResending, startResend] = useTransition();
  const cooldown = useCountdown(OTP_RESEND_COOLDOWN_SECONDS);

  const form = useForm<VerifyOtpInput>({
    resolver: zodResolver(verifyOtpSchema),
    defaultValues: { token: "", next },
  });

  const submit = form.handleSubmit((values) =>
    startVerify(async () => {
      const result = await verifyCode(values);
      if (result && !result.ok) {
        applyActionError(form, result.error);
        form.setValue("token", "");
      }
    }),
  );

  const onResend = () =>
    startResend(async () => {
      const result = await resendCode({});
      if (result.ok) {
        toast.success("A new code is on its way.");
        cooldown.restart();
      } else {
        toast.error(result.error.message);
      }
    });

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <Controller
        name="token"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="otp" className="sr-only">
              Verification code
            </FieldLabel>
            <InputOTP
              id="otp"
              maxLength={OTP_LENGTH}
              pattern={REGEXP_ONLY_DIGITS}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              disabled={isVerifying}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              onComplete={() => void submit()}
              aria-invalid={fieldState.invalid}
              containerClassName="justify-center"
            >
              <InputOTPGroup>
                {[0, 1, 2].map((i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="size-12 text-lg"
                    aria-invalid={fieldState.invalid}
                  />
                ))}
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                {[3, 4, 5].map((i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="size-12 text-lg"
                    aria-invalid={fieldState.invalid}
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
            {fieldState.invalid && (
              <FieldError className="text-center" errors={[fieldState.error]} />
            )}
          </Field>
        )}
      />

      <FormRootError form={form} />

      <Button type="submit" className="w-full" size="lg" disabled={isVerifying}>
        {isVerifying && <Spinner />}
        Verify and continue
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Button
          type="button"
          variant="link"
          className="h-auto p-0"
          onClick={onResend}
          disabled={cooldown.remaining > 0 || isResending}
        >
          {cooldown.remaining > 0 ? `Resend code in ${cooldown.remaining}s` : "Resend code"}
        </Button>
        <Link
          href={routes.signIn(next)}
          className="text-muted-foreground underline-offset-4 hover:underline"
        >
          Use a different email
        </Link>
      </div>
    </form>
  );
}

/** Ticks down once per second. Starts full because a code was just sent. */
function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = window.setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => window.clearTimeout(id);
  }, [remaining]);

  return { remaining, restart: () => setRemaining(seconds) };
}
