"use client";

import { SearchIcon } from "lucide-react";
import { debounce, useQueryStates } from "nuqs";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  FULFILLMENT_LABELS,
  FULFILLMENT_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUSES,
} from "@/features/orders/schemas";
import { orderListParams } from "@/features/orders/search-params";

const ALL = "__all__";

export function OrdersFilters() {
  const [isPending, startTransition] = useTransition();
  const [{ q, status, payment, fulfillment }, setParams] = useQueryStates(orderListParams, {
    shallow: false,
    startTransition,
  });
  const filtered = Boolean(q || status || payment || fulfillment);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <InputGroup className="w-full sm:w-72">
        <InputGroupAddon>{isPending ? <Spinner /> : <SearchIcon />}</InputGroupAddon>
        <InputGroupInput
          type="search"
          placeholder="Order #, customer, phone"
          aria-label="Search orders"
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
        value={status ?? ALL}
        onValueChange={(v) =>
          void setParams({ status: v === ALL ? null : (v as typeof status), page: null })
        }
      >
        <SelectTrigger className="w-36" aria-label="Filter by order status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Any status</SelectItem>
          {ORDER_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {ORDER_STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={payment ?? ALL}
        onValueChange={(v) =>
          void setParams({ payment: v === ALL ? null : (v as typeof payment), page: null })
        }
      >
        <SelectTrigger className="w-36" aria-label="Filter by payment">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Any payment</SelectItem>
          {PAYMENT_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {PAYMENT_STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={fulfillment ?? ALL}
        onValueChange={(v) =>
          void setParams({ fulfillment: v === ALL ? null : (v as typeof fulfillment), page: null })
        }
      >
        <SelectTrigger className="w-40" aria-label="Filter by fulfilment">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Any fulfilment</SelectItem>
          {FULFILLMENT_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {FULFILLMENT_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {filtered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            void setParams({ q: null, status: null, payment: null, fulfillment: null, page: null })
          }
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}
