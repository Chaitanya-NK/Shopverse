"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/shared/date-picker";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  type AttributeDefinition,
  type FormAttributeValue,
} from "@/features/products/attribute-values";

const NONE = "__none__";

type AttributeInputProps = {
  id: string;
  definition: AttributeDefinition;
  value: FormAttributeValue | undefined;
  onChange: (value: FormAttributeValue) => void;
  onBlur?: () => void;
  invalid?: boolean;
};

/** The right control for a category field, driven by its type. */
export function AttributeInput({
  id,
  definition,
  value,
  onChange,
  onBlur,
  invalid,
}: AttributeInputProps) {
  switch (definition.type) {
    case "boolean":
      return (
        <Switch
          id={id}
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked)}
          aria-invalid={invalid}
        />
      );

    case "select":
      return (
        <Select
          value={typeof value === "string" && value ? value : NONE}
          onValueChange={(next) => onChange(next === NONE ? "" : next)}
        >
          <SelectTrigger id={id} className="w-full" aria-invalid={invalid} onBlur={onBlur}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE} className="text-muted-foreground">
              Not set
            </SelectItem>
            {definition.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case "multiselect":
      return (
        <ToggleGroup
          id={id}
          type="multiple"
          variant="outline"
          size="sm"
          spacing={2}
          className="flex-wrap justify-start"
          value={Array.isArray(value) ? value : []}
          onValueChange={onChange}
          aria-invalid={invalid}
        >
          {definition.options.map((option) => (
            <ToggleGroupItem key={option} value={option} className="px-3">
              {option}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      );

    case "date":
      return (
        <DatePicker
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          onBlur={onBlur}
          clearable
          aria-invalid={invalid}
        />
      );

    default:
      return (
        <Input
          id={id}
          type="text"
          inputMode={definition.type === "number" ? "decimal" : undefined}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-invalid={invalid}
        />
      );
  }
}
