"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { type z } from "zod";

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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { createCategory, updateCategory } from "@/features/catalog/actions";
import { categoryFormSchema, TRACKING_MODES } from "@/features/catalog/schemas";
import { type CategoryNode } from "@/features/catalog/tree";
import { TRACKING_LABELS } from "@/features/organizations/industries";
import { applyActionError } from "@/lib/forms/apply-action-error";
import { slugify } from "@/lib/slug";

type FormInput = z.input<typeof categoryFormSchema>;
type FormOutput = z.output<typeof categoryFormSchema>;

type CategoryFormDialogProps = {
  organizationSlug: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} & (
  | { mode: "create"; parent: Pick<CategoryNode, "id" | "name">; category?: never }
  | { mode: "edit"; category: CategoryNode; parent?: never }
);

function toDefaults(category?: CategoryNode): FormInput {
  return {
    name: category?.name ?? "",
    slug: category?.slug ?? "",
    tracking: category?.tracking ?? "quantity",
    hsnCode: category?.hsnCode ?? "",
    gstRate: category?.gstRate ?? "",
    returnable: category?.returnable ?? true,
  };
}

export function CategoryFormDialog({
  trigger,
  open: openProp,
  onOpenChange,
  ...props
}: CategoryFormDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        {/* Mounted only while open, so every opening starts from fresh values. */}
        <CategoryForm {...props} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

type CategoryFormProps = DistributiveOmit<
  CategoryFormDialogProps,
  "trigger" | "open" | "onOpenChange"
> & {
  onDone: () => void;
};

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function CategoryForm(props: CategoryFormProps) {
  const { organizationSlug, mode, category, onDone } = props;
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [isPending, startTransition] = useTransition();
  const trackingLocked = mode === "edit" && category.productCount > 0;

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: toDefaults(category),
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result =
        mode === "edit"
          ? await updateCategory({ ...values, organizationSlug, categoryId: category.id })
          : await createCategory({ ...values, organizationSlug, parentId: props.parent.id });
      if (!result.ok) {
        applyActionError(form, result.error);
        return;
      }
      toast.success(mode === "edit" ? `${values.name} updated` : `${values.name} added`);
      onDone();
    }),
  );

  const idPrefix = `category-${category?.id ?? "new"}`;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <DialogHeader>
        <DialogTitle>
          {mode === "edit" ? `Edit ${category.name}` : `New category in ${props.parent.name}`}
        </DialogTitle>
        <DialogDescription>
          Products in a category share its details, variant options and stock tracking.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup>
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${idPrefix}-name`}>Name</FieldLabel>
              <Input
                {...field}
                id={`${idPrefix}-name`}
                placeholder="Smartwatches"
                aria-invalid={fieldState.invalid}
                onChange={(e) => {
                  field.onChange(e);
                  if (!slugTouched) form.setValue("slug", slugify(e.target.value, 80));
                }}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="slug"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${idPrefix}-slug`}>Handle</FieldLabel>
              <Input
                {...field}
                id={`${idPrefix}-slug`}
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
          name="tracking"
          control={form.control}
          render={({ field }) => (
            <Field data-disabled={trackingLocked || undefined}>
              <FieldLabel htmlFor={`${idPrefix}-tracking`}>Stock tracking</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange} disabled={trackingLocked}>
                <SelectTrigger id={`${idPrefix}-tracking`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRACKING_MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {TRACKING_LABELS[mode].label}
                      <span className="text-muted-foreground"> · {TRACKING_LABELS[mode].hint}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {trackingLocked && (
                <FieldDescription>
                  Fixed because this category already has products.
                </FieldDescription>
              )}
            </Field>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            name="hsnCode"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${idPrefix}-hsn`}>HSN code</FieldLabel>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  id={`${idPrefix}-hsn`}
                  inputMode="numeric"
                  placeholder="8517"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name="gstRate"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${idPrefix}-gst`}>GST rate (%)</FieldLabel>
                <Input
                  id={`${idPrefix}-gst`}
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={(field.value as string | number | null | undefined) ?? ""}
                  onChange={(e) => field.onChange(e.target.value)}
                  inputMode="decimal"
                  placeholder="18"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </div>
        <Controller
          name="returnable"
          control={form.control}
          render={({ field }) => (
            <Field orientation="horizontal">
              <Switch
                id={`${idPrefix}-returnable`}
                checked={field.value ?? true}
                onCheckedChange={field.onChange}
              />
              <span>
                <FieldLabel htmlFor={`${idPrefix}-returnable`}>Returnable</FieldLabel>
                <FieldDescription>
                  Shoppers can return these within your return window. Turn off for food, innerwear
                  or other items you can&apos;t take back.
                </FieldDescription>
              </span>
            </Field>
          )}
        />
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
          {mode === "edit" ? "Save changes" : "Add category"}
        </Button>
      </DialogFooter>
    </form>
  );
}
