"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { type z } from "zod";

import { FormRootError } from "@/components/shared/form-root-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { updateShopperProfile } from "@/features/shopper/actions";
import { profileSchema } from "@/features/shopper/schemas";
import { applyActionError } from "@/lib/forms/apply-action-error";

type FormInput = z.input<typeof profileSchema>;
type FormOutput = z.output<typeof profileSchema>;

export function ProfileForm({
  shopSlug,
  shopName,
  profile,
  redirectTo,
}: {
  shopSlug: string;
  shopName: string;
  profile: { name: string | null; email: string; phone: string | null; acceptsMarketing: boolean };
  /** After a first-time save, continue here. */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      shopSlug,
      name: profile.name ?? "",
      phone: profile.phone?.replace(/^\+91/, "") ?? "",
      acceptsMarketing: profile.acceptsMarketing,
    },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await updateShopperProfile(values);
      if (!result.ok) {
        applyActionError(form, result.error);
        return;
      }
      toast.success("Profile saved");
      form.reset(values);
      if (redirectTo) router.replace(redirectTo);
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="profile-email">Email</FieldLabel>
          <Input id="profile-email" value={profile.email} disabled readOnly />
          <FieldDescription>
            You sign in with this email. It can&apos;t be changed here.
          </FieldDescription>
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="profile-name">Full name</FieldLabel>
                <Input
                  {...field}
                  id="profile-name"
                  autoComplete="name"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name="phone"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="profile-phone">Mobile number (optional)</FieldLabel>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  id="profile-phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="98765 43210"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </div>
        <Controller
          name="acceptsMarketing"
          control={form.control}
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox
                id="profile-marketing"
                checked={Boolean(field.value)}
                onCheckedChange={(v) => field.onChange(v === true)}
              />
              <FieldLabel htmlFor="profile-marketing" className="font-normal">
                Email me offers and new arrivals from {shopName}
              </FieldLabel>
            </Field>
          )}
        />
      </FieldGroup>
      <FormRootError form={form} />
      <Button type="submit" disabled={isPending || (!form.formState.isDirty && !redirectTo)}>
        {isPending && <Spinner />}
        {redirectTo ? "Save and continue" : "Save changes"}
      </Button>
    </form>
  );
}
