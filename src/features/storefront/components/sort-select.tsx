"use client";

import { useQueryStates } from "nuqs";
import { useTransition } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATALOG_SORTS, type CatalogSort } from "@/features/storefront/schemas";
import { catalogParams } from "@/features/storefront/search-params";

export function SortSelect() {
  const [isPending, startTransition] = useTransition();
  const [{ sort }, setParams] = useQueryStates(catalogParams, { shallow: false, startTransition });
  return (
    <Select
      value={sort}
      onValueChange={(v) => void setParams({ sort: v as CatalogSort, page: null })}
    >
      <SelectTrigger
        className="w-48"
        aria-label="Sort products"
        data-pending={isPending || undefined}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {(Object.keys(CATALOG_SORTS) as CatalogSort[]).map((s) => (
          <SelectItem key={s} value={s}>
            {CATALOG_SORTS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
