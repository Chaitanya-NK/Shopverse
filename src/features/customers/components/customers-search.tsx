"use client";

import { SearchIcon } from "lucide-react";
import { debounce, useQueryStates } from "nuqs";
import { useTransition } from "react";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { customerListParams } from "@/features/customers/search-params";

export function CustomersSearch() {
  const [isPending, startTransition] = useTransition();
  const [{ q }, setParams] = useQueryStates(customerListParams, {
    shallow: false,
    startTransition,
  });
  return (
    <InputGroup className="w-full sm:w-80">
      <InputGroupAddon>{isPending ? <Spinner /> : <SearchIcon />}</InputGroupAddon>
      <InputGroupInput
        type="search"
        placeholder="Name, email or phone"
        aria-label="Search customers"
        defaultValue={q}
        onChange={(e) =>
          void setParams(
            { q: e.target.value || null, page: null },
            { limitUrlUpdates: e.target.value ? debounce(300) : undefined },
          )
        }
      />
    </InputGroup>
  );
}
