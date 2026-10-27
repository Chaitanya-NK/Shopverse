"use client";

import {
  BookOpenIcon,
  CookingPotIcon,
  DumbbellIcon,
  GemIcon,
  type LucideIcon,
  PackageIcon,
  PencilRulerIcon,
  PuzzleIcon,
  ShirtIcon,
  ShoppingBasketIcon,
  SmartphoneIcon,
  SofaIcon,
  SparklesIcon,
} from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { INDUSTRIES, type IndustryId } from "@/features/organizations/industries";

const ICONS: Record<IndustryId, LucideIcon> = {
  fashion: ShirtIcon,
  electronics: SmartphoneIcon,
  home_kitchen: CookingPotIcon,
  grocery: ShoppingBasketIcon,
  beauty: SparklesIcon,
  books: BookOpenIcon,
  toys: PuzzleIcon,
  sports: DumbbellIcon,
  furniture: SofaIcon,
  jewellery: GemIcon,
  stationery: PencilRulerIcon,
  other: PackageIcon,
};

type IndustryPickerProps = {
  value: IndustryId[];
  onChange: (value: IndustryId[]) => void;
  invalid?: boolean;
  disabled?: boolean;
  /** Limit the choices (e.g. hide industries the business already sells in). */
  options?: readonly IndustryId[];
};

/** Multi-select choice cards. Each is a real checkbox, so keyboard and screen readers work. */
export function IndustryPicker({
  value,
  onChange,
  invalid,
  disabled,
  options,
}: IndustryPickerProps) {
  const toggle = (id: IndustryId, checked: boolean) =>
    onChange(checked ? [...value, id] : value.filter((v) => v !== id));

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {INDUSTRIES.filter((i) => !options || options.includes(i.id)).map((industry) => {
        const Icon = ICONS[industry.id];
        const inputId = `industry-${industry.id}`;
        const checked = value.includes(industry.id);
        return (
          <FieldLabel key={industry.id} htmlFor={inputId}>
            <Field orientation="horizontal" data-invalid={invalid}>
              <Checkbox
                id={inputId}
                checked={checked}
                disabled={disabled}
                aria-invalid={invalid}
                onCheckedChange={(state) => toggle(industry.id, state === true)}
              />
              <FieldContent>
                <FieldTitle>
                  <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  {industry.label}
                </FieldTitle>
                <FieldDescription>{industry.examples}</FieldDescription>
              </FieldContent>
            </Field>
          </FieldLabel>
        );
      })}
    </div>
  );
}
