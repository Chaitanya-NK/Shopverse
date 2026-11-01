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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { saveSupplier } from "@/features/purchasing/actions";
import { type Supplier } from "@/features/purchasing/queries";
import { type SupplierFormInput, supplierFormSchema } from "@/features/purchasing/schemas";
import { applyActionError } from "@/lib/forms/apply-action-error";

type Props = {
  organizationSlug: string;
  supplier?: Supplier;
  trigger: React.ReactNode;
  onSaved?: (supplier: { id: string; name: string }) => void;
};

export function SupplierDialog({ organizationSlug, supplier, trigger, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{supplier ? "Edit supplier" : "New supplier"}</DialogTitle>
          <DialogDescription>Who you buy stock from. Only the name is required.</DialogDescription>
        </DialogHeader>
        {open && (
          <SupplierForm
            organizationSlug={organizationSlug}
            supplier={supplier}
            onDone={(saved) => {
              setOpen(false);
              onSaved?.(saved);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SupplierForm({
  organizationSlug,
  supplier,
  onDone,
}: {
  organizationSlug: string;
  supplier?: Supplier;
  onDone: (saved: { id: string; name: string }) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<SupplierFormInput, unknown, z.output<typeof supplierFormSchema>>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: {
      organizationSlug,
      supplierId: supplier?.id,
      name: supplier?.name ?? "",
      contactName: supplier?.contactName ?? "",
      email: supplier?.email ?? "",
      phone: supplier?.phone ?? "",
      gstin: supplier?.gstin ?? "",
      line1: supplier?.address.line1 ?? "",
      city: supplier?.address.city ?? "",
      state: supplier?.address.state ?? "",
      postalCode: supplier?.address.postalCode ?? "",
      paymentTerms: supplier?.paymentTerms ?? "",
      leadTimeDays: supplier?.leadTimeDays ?? "",
      notes: supplier?.notes ?? "",
      isActive: supplier?.isActive ?? true,
    },
  });

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      const result = await saveSupplier(form.getValues());
      if (!result.ok) {
        applyActionError(form, result.error);
        return;
      }
      toast.success(supplier ? "Supplier saved" : `${result.data.name} added`);
      onDone({ id: result.data.supplierId, name: result.data.name });
    }),
  );

  const text = (
    name: Exclude<keyof SupplierFormInput, "organizationSlug" | "supplierId" | "isActive">,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`supplier-${name}`}>{label}</FieldLabel>
          <Input
            id={`supplier-${name}`}
            {...field}
            value={(field.value as string | number | undefined) ?? ""}
            aria-invalid={fieldState.invalid}
            {...props}
          />
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FieldGroup className="gap-4">
        {text("name", "Name")}
        <div className="grid gap-4 sm:grid-cols-2">
          {text("contactName", "Contact person (optional)")}
          {text("phone", "Phone (optional)", { inputMode: "tel" })}
          {text("email", "Email (optional)", { type: "email", inputMode: "email" })}
          {text("gstin", "GSTIN (optional)", { className: "uppercase" })}
        </div>
        {text("line1", "Address (optional)")}
        <div className="grid gap-4 sm:grid-cols-3">
          {text("city", "City")}
          {text("state", "State")}
          {text("postalCode", "PIN code", { inputMode: "numeric" })}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {text("paymentTerms", "Payment terms (optional)", { placeholder: "30 days credit" })}
          {text("leadTimeDays", "Usual delivery time, days (optional)", {
            inputMode: "numeric",
          })}
        </div>
        <Controller
          control={form.control}
          name="notes"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="supplier-notes">Notes (optional)</FieldLabel>
              <Textarea id="supplier-notes" rows={2} {...field} value={field.value ?? ""} />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        {supplier && (
          <Controller
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <Field orientation="horizontal">
                <Switch
                  id="supplier-active"
                  checked={field.value ?? true}
                  onCheckedChange={field.onChange}
                />
                <FieldLabel htmlFor="supplier-active">Active (can be ordered from)</FieldLabel>
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
          {supplier ? "Save" : "Add supplier"}
        </Button>
      </DialogFooter>
    </form>
  );
}
