"use client";

import { type Control, Controller, type FieldValues, type Path } from "react-hook-form";

import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INDIAN_STATES } from "@/features/orders/india";

type AddressKey = "name" | "phone" | "line1" | "line2" | "city" | "state" | "postalCode";

/**
 * Recipient and street fields for any form that nests an address under
 * `prefix` (e.g. "address"). Used by the address book and checkout.
 */
export function AddressFields<T extends FieldValues>({
  control,
  prefix,
  idPrefix,
}: {
  control: Control<T>;
  prefix: string;
  idPrefix: string;
}) {
  const name = (key: AddressKey) => `${prefix}.${key}` as Path<T>;
  const id = (key: AddressKey) => `${idPrefix}-${key}`;

  const text = (key: AddressKey, label: string, props: React.ComponentProps<"input"> = {}) => (
    <Controller
      name={name(key)}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={id(key)}>{label}</FieldLabel>
          <Input
            {...field}
            {...props}
            value={field.value ?? ""}
            id={id(key)}
            aria-invalid={fieldState.invalid}
          />
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );

  return (
    <FieldGroup>
      <div className="grid gap-5 sm:grid-cols-2">
        {text("name", "Full name", { autoComplete: "name" })}
        {text("phone", "Mobile number", {
          type: "tel",
          autoComplete: "tel",
          placeholder: "98765 43210",
        })}
      </div>
      {text("line1", "House, street, area", { autoComplete: "address-line1" })}
      {text("line2", "Landmark (optional)", { autoComplete: "address-line2" })}
      <div className="grid gap-5 sm:grid-cols-3">
        {text("city", "City", { autoComplete: "address-level2" })}
        <Controller
          name={name("state")}
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={id("state")}>State</FieldLabel>
              <Select value={field.value || undefined} onValueChange={field.onChange}>
                <SelectTrigger
                  id={id("state")}
                  className="w-full"
                  aria-invalid={fieldState.invalid}
                >
                  <SelectValue placeholder="Choose" />
                </SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        {text("postalCode", "PIN code", { autoComplete: "postal-code", inputMode: "numeric" })}
      </div>
    </FieldGroup>
  );
}
