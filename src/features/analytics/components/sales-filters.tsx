"use client";

import { useQueryStates } from "nuqs";
import { useTransition } from "react";

import { DatePicker } from "@/components/shared/date-picker";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  addDays,
  MAX_RANGE_DAYS,
  RANGE_LABELS,
  RANGE_PRESETS,
  type RangePreset,
} from "@/features/analytics/ranges";
import { salesParams } from "@/features/analytics/search-params";

const ALL = "__all__";

type Props = {
  /** The range the page is showing (already resolved), so custom starts from it. */
  from: string;
  to: string;
  today: string;
  shops: { id: string; name: string }[];
};

/** One row of filters above every chart: period, then shop. */
export function SalesFilters({ from, to, today, shops }: Props) {
  const [isPending, startTransition] = useTransition();
  const [params, setParams] = useQueryStates(salesParams, { shallow: false, startTransition });
  const custom = params.range === "custom";

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field className="w-44">
        <FieldLabel htmlFor="sales-range">Period</FieldLabel>
        <Select
          value={params.range}
          onValueChange={(v) => {
            const range = v as RangePreset;
            void setParams(
              range === "custom" ? { range, from, to } : { range, from: null, to: null },
            );
          }}
        >
          <SelectTrigger id="sales-range" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_PRESETS.map((p) => (
              <SelectItem key={p} value={p}>
                {RANGE_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {custom && (
        <>
          <Field className="w-44">
            <FieldLabel htmlFor="sales-from">From</FieldLabel>
            <DatePicker
              id="sales-from"
              value={from}
              min={addDays(to, -(MAX_RANGE_DAYS - 1))}
              max={to}
              onChange={(value) => value && void setParams({ from: value })}
            />
          </Field>
          <Field className="w-44">
            <FieldLabel htmlFor="sales-to">To</FieldLabel>
            <DatePicker
              id="sales-to"
              value={to}
              min={from}
              max={today}
              onChange={(value) => value && void setParams({ to: value })}
            />
          </Field>
        </>
      )}
      {shops.length > 1 && (
        <Field className="w-52">
          <FieldLabel htmlFor="sales-shop">Shop</FieldLabel>
          <Select
            value={params.shop ?? ALL}
            onValueChange={(v) => void setParams({ shop: v === ALL ? null : v })}
          >
            <SelectTrigger id="sales-shop" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All shops</SelectItem>
              {shops.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      {isPending && <Spinner className="mb-2.5" />}
    </div>
  );
}
