"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormRootError } from "@/components/shared/form-root-error";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { SUPPORTED_CURRENCIES } from "@/features/organizations/schemas";
import { createShop } from "@/features/shops/actions";
import { type CreateShopInput, createShopSchema } from "@/features/shops/schemas";
import { applyActionError } from "@/lib/forms/apply-action-error";
import { slugify } from "@/lib/slug";

export function CreateShopDialog({ organizationSlug }: { organizationSlug: string }) {
  const [open, setOpen] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<CreateShopInput>({
    resolver: zodResolver(createShopSchema),
    defaultValues: { organizationSlug, name: "", slug: "", currency: "INR" },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await createShop(values);
      if (!result.ok) {
        applyActionError(form, result.error);
        return;
      }
      toast.success(`${values.name} created`);
      form.reset();
      setSlugTouched(false);
      setOpen(false);
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon />
          New shop
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          <DialogHeader>
            <DialogTitle>Create a shop</DialogTitle>
            <DialogDescription>
              A new storefront with its own catalogue and prices. It starts as a draft.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="new-shop-name">Shop name</FieldLabel>
                  <Input
                    {...field}
                    id="new-shop-name"
                    placeholder="Acme Electronics"
                    aria-invalid={fieldState.invalid}
                    onChange={(e) => {
                      field.onChange(e);
                      if (!slugTouched) form.setValue("slug", slugify(e.target.value));
                    }}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Controller
                name="slug"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="new-shop-slug">Handle</FieldLabel>
                    <Input
                      {...field}
                      id="new-shop-slug"
                      className="font-mono"
                      spellCheck={false}
                      aria-invalid={fieldState.invalid}
                      onChange={(e) => {
                        setSlugTouched(true);
                        field.onChange(e.target.value.toLowerCase());
                      }}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="currency"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="new-shop-currency">Currency</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="new-shop-currency" className="w-full">
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
                  </Field>
                )}
              />
            </div>
          </FieldGroup>

          <FormRootError form={form} />

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner />}
              Create shop
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
