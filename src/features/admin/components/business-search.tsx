"use client";

import { SearchIcon } from "lucide-react";
import { useQueryStates } from "nuqs";
import { useEffect, useState, useTransition } from "react";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { businessListParams } from "@/features/admin/search-params";

export function BusinessSearch() {
  const [isPending, startTransition] = useTransition();
  const [{ q }, setParams] = useQueryStates(businessListParams, {
    shallow: false,
    startTransition,
  });
  const [value, setValue] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => {
      if (value !== q) void setParams({ q: value || null, page: null });
    }, 300);
    return () => clearTimeout(t);
  }, [value, q, setParams]);
  return (
    <InputGroup className="max-w-sm">
      <InputGroupAddon>{isPending ? <Spinner /> : <SearchIcon />}</InputGroupAddon>
      <InputGroupInput
        aria-label="Search businesses"
        placeholder="Name, handle or owner email"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </InputGroup>
  );
}
