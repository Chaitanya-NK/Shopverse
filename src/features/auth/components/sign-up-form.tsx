"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";

import { FormRootError } from "@/components/shared/form-root-error";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { routes } from "@/config/routes";
import { requestSignUpCode } from "@/features/auth/actions";
import { type SignUpInput, signUpSchema } from "@/features/auth/schemas";
import { applyActionError } from "@/lib/forms/apply-action-error";

export function SignUpForm({ next }: { next?: string }) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: "", email: "", next },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await requestSignUpCode(values);
      if (result && !result.ok) applyActionError(form, result.error);
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FieldGroup>
        <Controller
          name="fullName"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="sign-up-name">Full name</FieldLabel>
              <Input
                {...field}
                id="sign-up-name"
                autoComplete="name"
                autoFocus
                placeholder="Priya Sharma"
                aria-invalid={fieldState.invalid}
                disabled={isPending}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="sign-up-email">Work email</FieldLabel>
              <Input
                {...field}
                id="sign-up-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@company.com"
                aria-invalid={fieldState.invalid}
                disabled={isPending}
              />
              <FieldDescription>We&apos;ll send a 6-digit code to verify it.</FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>

      <FormRootError form={form} />

      <Button type="submit" className="w-full" size="lg" disabled={isPending}>
        {isPending && <Spinner />}
        Create account
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={routes.signIn(next)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
