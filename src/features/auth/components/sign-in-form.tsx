"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";

import { FormRootError } from "@/components/shared/form-root-error";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { routes } from "@/config/routes";
import { requestSignInCode } from "@/features/auth/actions";
import { type SignInInput, signInSchema } from "@/features/auth/schemas";
import { applyActionError } from "@/lib/forms/apply-action-error";

export function SignInForm({ next }: { next?: string }) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", next },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await requestSignInCode(values);
      // On success the action redirects to /verify, so we only handle failures.
      if (result && !result.ok) applyActionError(form, result.error);
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FieldGroup>
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="sign-in-email">Work email</FieldLabel>
              <Input
                {...field}
                id="sign-in-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                placeholder="you@company.com"
                aria-invalid={fieldState.invalid}
                disabled={isPending}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>

      <FormRootError form={form} />

      <Button type="submit" className="w-full" size="lg" disabled={isPending}>
        {isPending && <Spinner />}
        Email me a sign-in code
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        New to Tradeloom?{" "}
        <Link
          href={routes.signUp(next)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
