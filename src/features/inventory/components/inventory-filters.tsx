"use client";

import { SearchIcon } from "lucide-react";
import { debounce, useQueryStates } from "nuqs";
import { useTransition } from "react";

import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { inventoryListParams } from "@/features/inventory/search-params";

const ALL = "__all__";

export function InventoryFilters({ warehouses }: { warehouses: { id: string; name: string }[] }) {
  const [isPending, startTransition] = useTransition();
  const [{ q, warehouse, low }, setParams] = useQueryStates(inventoryListParams, {
    shallow: false,
    startTransition,
  });

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <InputGroup className="w-full sm:w-72">
        <InputGroupAddon>{isPending ? <Spinner /> : <SearchIcon />}</InputGroupAddon>
        <InputGroupInput
          type="search"
          placeholder="Search product or SKU"
          aria-label="Search product or SKU"
          defaultValue={q}
          onChange={(e) =>
            void setParams(
              { q: e.target.value || null, page: null },
              { limitUrlUpdates: e.target.value ? debounce(300) : undefined },
            )
          }
        />
      </InputGroup>
      <Select
        value={warehouse ?? ALL}
        onValueChange={(v) => void setParams({ warehouse: v === ALL ? null : v, page: null })}
      >
        <SelectTrigger className="w-48" aria-label="Filter by warehouse">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All warehouses</SelectItem>
          {warehouses.map((w) => (
            <SelectItem key={w.id} value={w.id}>
              {w.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Field orientation="horizontal" className="w-auto">
        <Switch
          id="low-stock-only"
          checked={low}
          onCheckedChange={(checked) => void setParams({ low: checked || null, page: null })}
        />
        <FieldLabel htmlFor="low-stock-only" className="font-normal">
          Low stock only
        </FieldLabel>
      </Field>
    </div>
  );
}
