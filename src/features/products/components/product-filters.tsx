"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { debounce, useQueryStates } from "nuqs";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { PRODUCT_STATUS_LABELS, PRODUCT_STATUSES } from "@/features/products/schemas";
import { productListParams } from "@/features/products/search-params";

const ALL = "__all__";

type ProductFiltersProps = {
  categories: { id: string; name: string; group: string }[];
};

/** Search and filters live in the URL so results are shareable and server-rendered. */
export function ProductFilters({ categories }: ProductFiltersProps) {
  const [isPending, startTransition] = useTransition();
  const [{ q, status, category }, setParams] = useQueryStates(productListParams, {
    shallow: false,
    startTransition,
  });

  const groups = new Map<string, typeof categories>();
  for (const c of categories) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
  const filtered = Boolean(q || status || category);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <InputGroup className="w-full sm:w-72">
        <InputGroupAddon>{isPending ? <Spinner /> : <SearchIcon />}</InputGroupAddon>
        <InputGroupInput
          type="search"
          placeholder="Search products"
          aria-label="Search products"
          defaultValue={q}
          onChange={(e) =>
            void setParams(
              { q: e.target.value || null, page: null },
              { limitUrlUpdates: e.target.value ? debounce(300) : undefined },
            )
          }
        />
        {q && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label="Clear search"
              onClick={(e) => {
                const input = e.currentTarget
                  .closest("[data-slot=input-group]")
                  ?.querySelector("input");
                if (input) input.value = "";
                void setParams({ q: null, page: null });
              }}
            >
              <XIcon />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>

      <Select
        value={status ?? ALL}
        onValueChange={(v) =>
          void setParams({
            status: v === ALL ? null : (v as (typeof PRODUCT_STATUSES)[number]),
            page: null,
          })
        }
      >
        <SelectTrigger className="w-36" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {PRODUCT_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {PRODUCT_STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={category ?? ALL}
        onValueChange={(v) => void setParams({ category: v === ALL ? null : v, page: null })}
      >
        <SelectTrigger className="w-48" aria-label="Filter by category">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All categories</SelectItem>
          {[...groups.entries()].map(([group, items]) => (
            <SelectGroup key={group}>
              <SelectLabel>{group}</SelectLabel>
              {items.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      {filtered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void setParams({ q: null, status: null, category: null, page: null })}
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}
