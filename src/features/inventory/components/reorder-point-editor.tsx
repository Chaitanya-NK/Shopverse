"use client";

import { PencilIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { setReorderPoint } from "@/features/inventory/actions";
import { formatNumber } from "@/lib/format";

type ReorderPointEditorProps = {
  organizationSlug: string;
  variantId: string;
  warehouseId: string;
  value: number;
  label: string;
  canEdit: boolean;
};

/** Inline editor for the stock level that triggers a low-stock alert. */
export function ReorderPointEditor({
  organizationSlug,
  variantId,
  warehouseId,
  value,
  label,
  canEdit,
}: ReorderPointEditorProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!canEdit) return <span className="tabular-nums">{formatNumber(value)}</span>;

  const save = () =>
    startTransition(async () => {
      const result = await setReorderPoint({
        organizationSlug,
        variantId,
        warehouseId,
        reorderPoint: draft,
      });
      if (!result.ok) {
        setError(result.error.fieldErrors?.reorderPoint?.[0] ?? result.error.message);
        return;
      }
      toast.success(`Reorder point set to ${result.data.reorder_point}`);
      setOpen(false);
    });

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft(String(value));
          setError(null);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 tabular-nums"
          aria-label={`Reorder point for ${label}: ${value}. Edit`}
        >
          {formatNumber(value)}
          <PencilIcon className="size-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor={`reorder-${variantId}-${warehouseId}`}>Reorder point</FieldLabel>
            <Input
              id={`reorder-${variantId}-${warehouseId}`}
              inputMode="numeric"
              value={draft}
              autoFocus
              aria-invalid={Boolean(error)}
              onChange={(e) => setDraft(e.target.value)}
            />
            <FieldDescription className={error ? "text-destructive" : undefined}>
              {error ?? "Flag as low stock when available units drop to this level."}
            </FieldDescription>
          </Field>
          <Button type="submit" size="sm" className="w-full" disabled={isPending}>
            {isPending && <Spinner />}
            Save
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
