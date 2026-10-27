"use client";

import { StoreIcon } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { useTransition } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { SHOP_PARAM } from "@/features/shops/schemas";

const ALL = "__all__";

/**
 * Scopes the current page to one shop via `?shop=<slug>`. Living in the URL
 * makes filtered views shareable and lets Server Components read the scope.
 */
export function ShopSwitcher({ shops }: { shops: { slug: string; name: string }[] }) {
  const [isPending, startTransition] = useTransition();
  const [shop, setShop] = useQueryState(
    SHOP_PARAM,
    parseAsString.withOptions({ shallow: false, history: "push", startTransition }),
  );

  const value = shop && shops.some((s) => s.slug === shop) ? shop : ALL;

  return (
    <Select value={value} onValueChange={(next) => void setShop(next === ALL ? null : next)}>
      <SelectTrigger size="sm" className="min-w-44" aria-label="Filter by shop">
        {isPending ? <Spinner /> : <StoreIcon />}
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value={ALL}>All shops</SelectItem>
        <SelectSeparator />
        {shops.map((s) => (
          <SelectItem key={s.slug} value={s.slug}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
