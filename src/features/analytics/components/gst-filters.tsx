"use client";

import { useQueryStates } from "nuqs";
import { useTransition } from "react";

import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { formatMonth } from "@/features/analytics/ranges";
import { gstParams } from "@/features/analytics/search-params";

const ALL = "__all__";

export function GstFilters({
  month,
  months,
  shops,
}: {
  month: string;
  months: string[];
  shops: { id: string; name: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [params, setParams] = useQueryStates(gstParams, { shallow: false, startTransition });

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field className="w-48">
        <FieldLabel htmlFor="gst-month">Month</FieldLabel>
        <Select value={month} onValueChange={(v) => void setParams({ month: v })}>
          <SelectTrigger id="gst-month" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m} value={m}>
                {formatMonth(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {shops.length > 1 && (
        <Field className="w-52">
          <FieldLabel htmlFor="gst-shop">Shop</FieldLabel>
          <Select
            value={params.shop ?? ALL}
            onValueChange={(v) => void setParams({ shop: v === ALL ? null : v })}
          >
            <SelectTrigger id="gst-shop" className="w-full">
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
