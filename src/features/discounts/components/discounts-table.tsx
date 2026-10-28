"use client";

import {
  CopyIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteDiscount, setDiscountActive } from "@/features/discounts/actions";
import { DiscountDialog } from "@/features/discounts/components/discount-dialog";
import {
  describeDiscount,
  DISCOUNT_STATES,
  type DiscountState,
  type DiscountSummary,
} from "@/features/discounts/schemas";
import { formatMoney } from "@/lib/format";

const STATE_VARIANT: Record<DiscountState, "default" | "secondary" | "outline"> = {
  active: "default",
  scheduled: "secondary",
  expired: "outline",
  used_up: "outline",
  inactive: "outline",
};

const day = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

function period(d: DiscountSummary) {
  const from = day.format(new Date(d.startsAt));
  return d.endsAt ? `${from} – ${day.format(new Date(d.endsAt))}` : `From ${from}`;
}

export function DiscountsTable({
  organizationSlug,
  discounts,
  shops,
  currency,
  canManage,
}: {
  organizationSlug: string;
  discounts: DiscountSummary[];
  shops: { id: string; name: string }[];
  currency: string;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<DiscountSummary | null>(null);
  const [deleting, setDeleting] = useState<DiscountSummary | null>(null);
  const [, startTransition] = useTransition();
  const shopName = new Map(shops.map((s) => [s.id, s.name]));

  const toggle = (d: DiscountSummary) =>
    startTransition(async () => {
      const result = await setDiscountActive({
        organizationSlug,
        discountId: d.id,
        active: !d.isActive,
      });
      if (result.ok) toast.success(d.isActive ? "Discount switched off" : "Discount switched on");
      else toast.error(result.error.message);
    });

  return (
    <>
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="pl-4">Discount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">When</TableHead>
              <TableHead className="text-right">Used</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Saved customers</TableHead>
              {canManage && <TableHead className="w-12 pr-4" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {discounts.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="max-w-0 pl-4 sm:max-w-none">
                  <span className="flex flex-wrap items-center gap-2">
                    {d.code ? (
                      <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-sm font-medium">
                        {d.code}
                      </span>
                    ) : (
                      <Badge variant="secondary">
                        <SparklesIcon />
                        Automatic
                      </Badge>
                    )}
                    <span className="truncate font-medium">{d.title}</span>
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {describeDiscount(d, currency)}
                    {d.shopIds && ` · ${d.shopIds.map((id) => shopName.get(id) ?? "?").join(", ")}`}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={STATE_VARIANT[d.state]}>{DISCOUNT_STATES[d.state]}</Badge>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  {period(d)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {d.uses}
                  {d.usageLimit !== null && (
                    <span className="text-muted-foreground"> / {d.usageLimit}</span>
                  )}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {formatMoney(d.totalSaved, currency)}
                </TableCell>
                {canManage && (
                  <TableCell className="pr-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Options for ${d.title}`}>
                          <MoreHorizontalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(d)}>
                          <PencilIcon /> Edit
                        </DropdownMenuItem>
                        {d.code && (
                          <DropdownMenuItem
                            onSelect={() => {
                              void navigator.clipboard.writeText(d.code!);
                              toast.success("Code copied");
                            }}
                          >
                            <CopyIcon /> Copy code
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onSelect={() => toggle(d)}>
                          {d.isActive ? <PauseIcon /> : <PlayIcon />}
                          {d.isActive ? "Switch off" : "Switch on"}
                        </DropdownMenuItem>
                        {d.uses === 0 && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(d)}>
                              <Trash2Icon /> Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <DiscountDialog
          organizationSlug={organizationSlug}
          shops={shops}
          discount={editing}
          open
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.code ?? deleting?.title ?? "discount"}?`}
        description="It hasn't been used yet, so it can be removed completely."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return true;
          const result = await deleteDiscount({ organizationSlug, discountId: deleting.id });
          if (!result.ok) {
            toast.error(result.error.message);
            return false;
          }
          toast.success("Discount deleted");
          return true;
        }}
      />
    </>
  );
}
