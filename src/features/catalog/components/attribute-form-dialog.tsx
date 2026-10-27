"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { type z } from "zod";

import { FormRootError } from "@/components/shared/form-root-error";
import { TagInput } from "@/components/shared/tag-input";
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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
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
import { createAttribute, updateAttribute } from "@/features/catalog/actions";
import {
  ATTRIBUTE_TYPE_LABELS,
  ATTRIBUTE_TYPES,
  attributeFormSchema,
  canBeVariant,
  hasOptions,
} from "@/features/catalog/schemas";
import { type CategoryAttribute } from "@/features/catalog/tree";
import { applyActionError } from "@/lib/forms/apply-action-error";
import { toAttributeKey } from "@/lib/slug";

type FormInput = z.input<typeof attributeFormSchema>;
type FormOutput = z.output<typeof attributeFormSchema>;

type AttributeFormDialogProps = {
  organizationSlug: string;
  categoryId: string;
  categoryName: string;
  /** Omit to add a new field. */
  attribute?: CategoryAttribute;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function toDefaults(attribute?: CategoryAttribute): FormInput {
  return {
    label: attribute?.label ?? "",
    key: attribute?.key ?? "",
    type: attribute?.type ?? "text",
    options: attribute?.options ?? [],
    unit: attribute?.unit ?? "",
    isRequired: attribute?.isRequired ?? false,
    isVariantOption: attribute?.isVariantOption ?? false,
  };
}

export function AttributeFormDialog({ trigger, ...props }: AttributeFormDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = props.open ?? uncontrolledOpen;
  const setOpen = props.onOpenChange ?? setUncontrolledOpen;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        {/* Mounted only while open, so every opening starts from fresh values. */}
        <AttributeForm {...props} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AttributeForm({
  organizationSlug,
  categoryId,
  categoryName,
  attribute,
  onDone,
}: Omit<AttributeFormDialogProps, "trigger" | "open" | "onOpenChange"> & { onDone: () => void }) {
  const isEdit = Boolean(attribute);
  const [keyTouched, setKeyTouched] = useState(isEdit);
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(attributeFormSchema),
    defaultValues: toDefaults(attribute),
  });
  const [type, isVariantOption] = useWatch({
    control: form.control,
    name: ["type", "isVariantOption"],
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = attribute
        ? await updateAttribute({
            organizationSlug,
            attributeId: attribute.id,
            label: values.label,
            options: values.options,
            unit: values.unit,
            isRequired: values.isRequired,
          })
        : await createAttribute({ ...values, organizationSlug, categoryId });
      if (!result.ok) {
        applyActionError(form, result.error);
        return;
      }
      toast.success(
        isEdit ? `${values.label} updated` : `${values.label} added to ${categoryName}`,
      );
      onDone();
    }),
  );

  const idPrefix = `attribute-${attribute?.id ?? `new-${categoryId}`}`;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <DialogHeader>
        <DialogTitle>
          {isEdit ? `Edit ${attribute?.label}` : `New field in ${categoryName}`}
        </DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Type, key and whether it creates variants are fixed once a field exists."
            : "Product details are filled in once per product; variant options create one SKU per value."}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Controller
            name="label"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${idPrefix}-label`}>Label</FieldLabel>
                <Input
                  {...field}
                  id={`${idPrefix}-label`}
                  placeholder="Screen size"
                  aria-invalid={fieldState.invalid}
                  onChange={(e) => {
                    field.onChange(e);
                    if (!keyTouched) form.setValue("key", toAttributeKey(e.target.value));
                  }}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name="key"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} data-disabled={isEdit || undefined}>
                <FieldLabel htmlFor={`${idPrefix}-key`}>Key</FieldLabel>
                <Input
                  {...field}
                  id={`${idPrefix}-key`}
                  className="font-mono"
                  spellCheck={false}
                  disabled={isEdit}
                  aria-invalid={fieldState.invalid}
                  onChange={(e) => {
                    setKeyTouched(true);
                    field.onChange(e.target.value.toLowerCase());
                  }}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </div>

        <Controller
          name="type"
          control={form.control}
          render={({ field }) => (
            <Field data-disabled={isEdit || undefined}>
              <FieldLabel htmlFor={`${idPrefix}-type`}>Type</FieldLabel>
              <Select
                value={field.value}
                disabled={isEdit}
                onValueChange={(value) => {
                  field.onChange(value);
                  if (!canBeVariant(value as FormInput["type"])) {
                    form.setValue("isVariantOption", false);
                  }
                }}
              >
                <SelectTrigger id={`${idPrefix}-type`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ATTRIBUTE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ATTRIBUTE_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />

        {hasOptions(type) && (
          <Controller
            name="options"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${idPrefix}-options`}>Options</FieldLabel>
                <TagInput
                  id={`${idPrefix}-options`}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="e.g. Cotton, Linen, Wool"
                  aria-invalid={fieldState.invalid}
                />
                {isEdit && (
                  <FieldDescription>
                    Options still used by products can’t be removed.
                  </FieldDescription>
                )}
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        )}

        {(type === "number" || type === "text") && (
          <Controller
            name="unit"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${idPrefix}-unit`}>Unit (optional)</FieldLabel>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  id={`${idPrefix}-unit`}
                  placeholder="in, kg, mAh, L"
                  className="max-w-40"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        )}

        {canBeVariant(type) && (
          <Controller
            name="isVariantOption"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field
                orientation="horizontal"
                className="rounded-lg border p-3"
                data-invalid={fieldState.invalid}
                data-disabled={isEdit || undefined}
              >
                <FieldContent>
                  <FieldLabel htmlFor={`${idPrefix}-variant`}>Creates variants</FieldLabel>
                  <FieldDescription>
                    Each value becomes its own SKU with its own price and stock, like Size or
                    Storage.
                  </FieldDescription>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </FieldContent>
                <Switch
                  id={`${idPrefix}-variant`}
                  checked={field.value}
                  disabled={isEdit}
                  onCheckedChange={field.onChange}
                />
              </Field>
            )}
          />
        )}

        {!isVariantOption && (
          <Controller
            name="isRequired"
            control={form.control}
            render={({ field }) => (
              <Field orientation="horizontal" className="rounded-lg border p-3">
                <FieldContent>
                  <FieldLabel htmlFor={`${idPrefix}-required`}>Required</FieldLabel>
                  <FieldDescription>Products can’t be saved without it.</FieldDescription>
                </FieldContent>
                <Switch
                  id={`${idPrefix}-required`}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </Field>
            )}
          />
        )}
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
          {isEdit ? "Save changes" : "Add field"}
        </Button>
      </DialogFooter>
    </form>
  );
}
