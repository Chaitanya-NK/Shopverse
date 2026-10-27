"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { type z } from "zod";

import { FormRootError } from "@/components/shared/form-root-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { createWarehouse, updateWarehouse } from "@/features/warehouses/actions";
import { type WarehouseSummary } from "@/features/warehouses/queries";
import { warehouseFormSchema } from "@/features/warehouses/schemas";
import { applyActionError } from "@/lib/forms/apply-action-error";

type FormInput = z.input<typeof warehouseFormSchema>;
type FormOutput = z.output<typeof warehouseFormSchema>;

type ShopOption = { id: string; name: string };

type WarehouseFormDialogProps = {
  organizationSlug: string;
  shops: ShopOption[];
  /** Omit to create a new warehouse. */
  warehouse?: WarehouseSummary;
  trigger: React.ReactNode;
};

function toDefaults(warehouse?: WarehouseSummary): FormInput {
  return {
    name: warehouse?.name ?? "",
    code: warehouse?.code ?? "",
    address: warehouse?.address ?? { line1: "", city: "", state: "", postalCode: "" },
    isActive: warehouse?.isActive ?? true,
    shopIds: warehouse?.shopIds ?? [],
  };
}

export function WarehouseFormDialog({ trigger, ...props }: WarehouseFormDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {/* Mounted only while open, so every opening starts from fresh values. */}
        <WarehouseForm {...props} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function WarehouseForm({
  organizationSlug,
  shops,
  warehouse,
  onDone,
}: Omit<WarehouseFormDialogProps, "trigger"> & { onDone: () => void }) {
  const isEdit = Boolean(warehouse);
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(warehouseFormSchema),
    defaultValues: toDefaults(warehouse),
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = warehouse
        ? await updateWarehouse({ ...values, organizationSlug, warehouseId: warehouse.id })
        : await createWarehouse({ ...values, organizationSlug });
      if (!result.ok) {
        applyActionError(form, result.error);
        return;
      }
      toast.success(isEdit ? `${values.name} updated` : `${values.name} added`);
      onDone();
    }),
  );

  const id = (name: string) => `warehouse-${warehouse?.id ?? "new"}-${name}`;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <DialogHeader>
        <DialogTitle>{isEdit ? `Edit ${warehouse?.name}` : "Add a warehouse"}</DialogTitle>
        <DialogDescription>
          Any place you keep stock: a fulfilment centre, a back room or a store floor.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={id("name")}>Name</FieldLabel>
                <Input
                  {...field}
                  id={id("name")}
                  placeholder="Bengaluru hub"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name="code"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={id("code")}>Code</FieldLabel>
                <Input
                  {...field}
                  id={id("code")}
                  placeholder="BLR-1"
                  className="font-mono uppercase"
                  spellCheck={false}
                  aria-invalid={fieldState.invalid}
                  onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </div>

        <Controller
          name="address.line1"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={id("line1")}>Address</FieldLabel>
              <Input
                {...field}
                value={field.value ?? ""}
                id={id("line1")}
                placeholder="Plot 14, KIADB Industrial Area"
                autoComplete="address-line1"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ["address.city", "City", "address-level2", "Bengaluru"],
              ["address.state", "State", "address-level1", "Karnataka"],
              ["address.postalCode", "PIN code", "postal-code", "560099"],
            ] as const
          ).map(([name, label, autoComplete, placeholder]) => (
            <Controller
              key={name}
              name={name}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={id(name)}>{label}</FieldLabel>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    id={id(name)}
                    placeholder={placeholder}
                    autoComplete={autoComplete}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          ))}
        </div>

        {shops.length > 0 && (
          <Controller
            name="shopIds"
            control={form.control}
            render={({ field }) => (
              <FieldSet>
                <FieldLegend variant="label">Fulfils orders for</FieldLegend>
                <FieldDescription>
                  Orders from these shops can be picked from this warehouse.
                </FieldDescription>
                <div className="grid gap-3 sm:grid-cols-2">
                  {shops.map((shop) => {
                    const checked = field.value.includes(shop.id);
                    return (
                      <Field key={shop.id} orientation="horizontal">
                        <Checkbox
                          id={id(`shop-${shop.id}`)}
                          checked={checked}
                          onCheckedChange={(next) =>
                            field.onChange(
                              next === true
                                ? [...field.value, shop.id]
                                : field.value.filter((v) => v !== shop.id),
                            )
                          }
                        />
                        <FieldLabel htmlFor={id(`shop-${shop.id}`)} className="font-normal">
                          {shop.name}
                        </FieldLabel>
                      </Field>
                    );
                  })}
                </div>
              </FieldSet>
            )}
          />
        )}

        <Controller
          name="isActive"
          control={form.control}
          render={({ field }) => (
            <Field orientation="horizontal" className="rounded-lg border p-3">
              <FieldContent>
                <FieldLabel htmlFor={id("active")}>Active</FieldLabel>
                <FieldDescription>
                  Inactive warehouses keep their history but can’t receive new stock.
                </FieldDescription>
              </FieldContent>
              <Switch id={id("active")} checked={field.value} onCheckedChange={field.onChange} />
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
          {isEdit ? "Save changes" : "Add warehouse"}
        </Button>
      </DialogFooter>
    </form>
  );
}
