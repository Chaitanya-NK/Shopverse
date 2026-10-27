"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  MapPinIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { type z } from "zod";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormRootError } from "@/components/shared/form-root-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  deleteShopperAddress,
  saveShopperAddress,
  setDefaultShopperAddress,
} from "@/features/shopper/actions";
import { AddressFields } from "@/features/shopper/components/address-fields";
import {
  formatAddressLine,
  type SavedAddress,
  saveAddressSchema,
} from "@/features/shopper/schemas";
import { applyActionError } from "@/lib/forms/apply-action-error";

export const MAX_ADDRESSES = 10;

export function AddressBook({
  shopSlug,
  addresses,
}: {
  shopSlug: string;
  addresses: SavedAddress[];
}) {
  const [editing, setEditing] = useState<SavedAddress | "new" | null>(null);
  const [deleting, setDeleting] = useState<SavedAddress | null>(null);
  const [, startTransition] = useTransition();

  const makeDefault = (address: SavedAddress) =>
    startTransition(async () => {
      const result = await setDefaultShopperAddress({ shopSlug, addressId: address.id });
      if (result.ok) toast.success("Default address updated");
      else toast.error(result.error.message);
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {addresses.length} of {MAX_ADDRESSES} saved. Your default is picked at checkout.
        </p>
        <Button onClick={() => setEditing("new")} disabled={addresses.length >= MAX_ADDRESSES}>
          <PlusIcon /> Add address
        </Button>
      </div>

      {addresses.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MapPinIcon />
            </EmptyMedia>
            <EmptyTitle>No saved addresses</EmptyTitle>
            <EmptyDescription>
              Add one now, or save it the next time you check out.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {addresses.map((address) => (
            <Card key={address.id} className={address.isDefault ? "border-primary" : undefined}>
              <CardContent className="flex items-start gap-3">
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {address.label || address.name}
                    {address.isDefault && <Badge variant="secondary">Default</Badge>}
                  </p>
                  {address.label && <p>{address.name}</p>}
                  <p className="text-muted-foreground">{formatAddressLine(address)}</p>
                  <p className="text-muted-foreground">{address.phone}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Options for ${address.label || address.name}`}
                    >
                      <MoreHorizontalIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(address)}>
                      <PencilIcon /> Edit
                    </DropdownMenuItem>
                    {!address.isDefault && (
                      <DropdownMenuItem onSelect={() => makeDefault(address)}>
                        <StarIcon /> Make default
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(address)}>
                      <Trash2Icon /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add address" : "Edit address"}</DialogTitle>
            <DialogDescription>Where should we deliver?</DialogDescription>
          </DialogHeader>
          {editing !== null && (
            <AddressForm
              shopSlug={shopSlug}
              address={editing === "new" ? null : editing}
              isFirst={addresses.length === 0}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this address?"
        description={deleting ? formatAddressLine(deleting) : ""}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return true;
          const result = await deleteShopperAddress({ shopSlug, addressId: deleting.id });
          if (!result.ok) {
            toast.error(result.error.message);
            return false;
          }
          toast.success("Address deleted");
          return true;
        }}
      />
    </div>
  );
}

type FormInput = z.input<typeof saveAddressSchema>;
type FormOutput = z.output<typeof saveAddressSchema>;

function AddressForm({
  shopSlug,
  address,
  isFirst,
  onDone,
}: {
  shopSlug: string;
  address: SavedAddress | null;
  isFirst: boolean;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(saveAddressSchema),
    defaultValues: {
      shopSlug,
      addressId: address?.id,
      address: {
        label: address?.label ?? "",
        name: address?.name ?? "",
        phone: address?.phone.replace(/^\+91/, "") ?? "",
        line1: address?.line1 ?? "",
        line2: address?.line2 ?? "",
        city: address?.city ?? "",
        state: address?.state ?? "",
        postalCode: address?.postalCode ?? "",
        isDefault: address?.isDefault ?? isFirst,
      },
    },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await saveShopperAddress(values);
      if (!result.ok) {
        applyActionError(form, result.error);
        return;
      }
      toast.success(address ? "Address updated" : "Address saved");
      onDone();
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FieldGroup>
        <Controller
          name="address.label"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="addr-label">Label (optional)</FieldLabel>
              <Input
                {...field}
                id="addr-label"
                placeholder="Home, Office…"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <AddressFields control={form.control} prefix="address" idPrefix="addr" />
        <Controller
          name="address.isDefault"
          control={form.control}
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox
                id="addr-default"
                checked={Boolean(field.value)}
                onCheckedChange={(v) => field.onChange(v === true)}
                disabled={address?.isDefault}
              />
              <FieldLabel htmlFor="addr-default" className="font-normal">
                Use as my default address
              </FieldLabel>
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
          Save address
        </Button>
      </DialogFooter>
    </form>
  );
}
