"use client";

import { PackageCheckIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { DatePicker } from "@/components/shared/date-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { receivePurchaseOrder } from "@/features/purchasing/actions";
import { type PurchaseOrderLine } from "@/features/purchasing/queries";
import { parseSerials } from "@/features/purchasing/schemas";

type Entry = { quantity: string; serials: string; batchCode: string; expiryDate: string };

/** Record what arrived: quantities, or serials / batch details where the product needs them. */
export function ReceiveDialog({
  organizationSlug,
  purchaseOrderId,
  warehouseName,
  lines,
}: {
  organizationSlug: string;
  purchaseOrderId: string;
  warehouseName: string;
  lines: PurchaseOrderLine[];
}) {
  const open_ = lines.filter((l) => l.receivedQuantity < l.quantity);
  const blank = () =>
    Object.fromEntries(
      open_.map((l) => [
        l.id,
        {
          quantity: l.tracking === "serial" ? "" : String(l.quantity - l.receivedQuantity),
          serials: "",
          batchCode: "",
          expiryDate: "",
        },
      ]),
    ) as Record<string, Entry>;
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Record<string, Entry>>(blank);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const set = (id: string, patch: Partial<Entry>) =>
    setEntries((e) => ({ ...e, [id]: { ...e[id]!, ...patch } }));

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const payload = open_.map((l) => {
        const e = entries[l.id]!;
        return {
          itemId: l.id,
          quantity: l.tracking === "serial" ? 0 : Number(e.quantity || 0),
          serials: l.tracking === "serial" ? parseSerials(e.serials) : [],
          batchCode: e.batchCode,
          expiryDate: e.expiryDate,
        };
      });
      const missingBatch = open_.find(
        (l, i) => l.tracking === "batch" && payload[i]!.quantity > 0 && !payload[i]!.batchCode,
      );
      if (missingBatch) {
        setError(`Enter the batch code for ${missingBatch.productTitle}.`);
        return;
      }
      const lines = payload.filter((p) => p.quantity > 0 || p.serials.length > 0);
      if (lines.length === 0) {
        setError("Enter what arrived.");
        return;
      }
      const result = await receivePurchaseOrder({ organizationSlug, purchaseOrderId, lines });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success(
        `${result.data.received} unit${result.data.received === 1 ? "" : "s"} added to ${warehouseName}`,
      );
      setOpen(false);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setEntries(blank());
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <PackageCheckIcon />
          Receive delivery
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Receive delivery</DialogTitle>
          <DialogDescription>
            What arrived goes straight into {warehouseName}&apos;s stock. Leave a line at 0 if it
            didn&apos;t come.
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-lg border">
          {open_.map((l) => {
            const e = entries[l.id]!;
            const left = l.quantity - l.receivedQuantity;
            const name = `${l.productTitle}${l.title && l.title !== "Default" ? ` · ${l.title}` : ""}`;
            return (
              <li key={l.id} className="space-y-3 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="font-medium">{name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{l.sku}</p>
                  </div>
                  <Badge variant="outline">
                    {left} of {l.quantity} to come
                  </Badge>
                </div>
                {l.tracking === "serial" ? (
                  <Field>
                    <FieldLabel htmlFor={`serials-${l.id}`}>Serial numbers / IMEIs</FieldLabel>
                    <Textarea
                      id={`serials-${l.id}`}
                      rows={3}
                      className="font-mono"
                      value={e.serials}
                      onChange={(ev) => set(l.id, { serials: ev.target.value })}
                      placeholder="Scan or type one per line"
                    />
                    <FieldDescription>
                      {parseSerials(e.serials).length} entered, up to {left}.
                    </FieldDescription>
                  </Field>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field>
                      <FieldLabel htmlFor={`qty-${l.id}`}>Quantity received</FieldLabel>
                      <Input
                        id={`qty-${l.id}`}
                        inputMode="numeric"
                        value={e.quantity}
                        onChange={(ev) =>
                          set(l.id, { quantity: ev.target.value.replace(/\D/g, "") })
                        }
                      />
                    </Field>
                    {l.tracking === "batch" && (
                      <>
                        <Field>
                          <FieldLabel htmlFor={`batch-${l.id}`}>Batch code</FieldLabel>
                          <Input
                            id={`batch-${l.id}`}
                            className="uppercase"
                            value={e.batchCode}
                            onChange={(ev) => set(l.id, { batchCode: ev.target.value })}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`expiry-${l.id}`}>Expiry (optional)</FieldLabel>
                          <DatePicker
                            id={`expiry-${l.id}`}
                            value={e.expiryDate}
                            onChange={(v) => set(l.id, { expiryDate: v })}
                          />
                        </Field>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={submit} disabled={isPending}>
            {isPending && <Spinner />}
            Add to stock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
