"use client";

import { CalendarIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-10-27" -> a local Date (no timezone shift); anything else -> undefined. */
export function parseIsoDate(value: string | null | undefined): Date | undefined {
  const m = value ? ISO_DATE.exec(value) : null;
  if (!m) return undefined;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** A local Date -> "2026-10-27". */
export function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const display = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

type DatePickerProps = {
  id?: string;
  /** "YYYY-MM-DD" or "" for no date. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Earliest / latest selectable day, "YYYY-MM-DD". */
  min?: string;
  max?: string;
  /** Show a clear button when a date is set. */
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
  onBlur?: () => void;
};

/** shadcn date picker (Popover + Calendar) with an ISO date string value. */
export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  min,
  max,
  clearable = false,
  disabled,
  className,
  onBlur,
  ...aria
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseIsoDate(value);
  const minDate = parseIsoDate(min);
  const maxDate = parseIsoDate(max);
  const today = new Date();
  // Month/year dropdowns span the allowed range (or a generous default).
  const startMonth = minDate ?? new Date(today.getFullYear() - 30, 0, 1);
  const endMonth = maxDate ?? new Date(today.getFullYear() + 15, 11, 31);

  return (
    <div className={cn("relative", className)}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) onBlur?.();
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={aria["aria-invalid"]}
            aria-label={aria["aria-label"]}
            className={cn(
              "w-full justify-start px-3 text-left font-normal",
              !selected && "text-muted-foreground",
              clearable && selected && "pr-9",
            )}
          >
            <CalendarIcon className="text-muted-foreground" />
            {selected ? display.format(selected) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? (maxDate && maxDate < today ? maxDate : undefined)}
            captionLayout="dropdown"
            startMonth={startMonth}
            endMonth={endMonth}
            disabled={[
              ...(minDate ? [{ before: minDate }] : []),
              ...(maxDate ? [{ after: maxDate }] : []),
            ]}
            onSelect={(date) => {
              onChange(date ? toIsoDate(date) : "");
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {clearable && selected && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-1/2 right-1 size-7 -translate-y-1/2 text-muted-foreground"
          aria-label="Clear date"
          onClick={() => onChange("")}
        >
          <XIcon />
        </Button>
      )}
    </div>
  );
}
