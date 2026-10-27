"use client";

import { PackagePlusIcon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DatePicker, toIsoDate } from "@/components/shared/date-picker";
import { Spinner } from "@/components/ui/spinner";
import { listInStockSerials } from "@/features/inventory/actions";
import { SerialPicker } from "@/features/inventory/components/serial-picker";
import { type Tracking } from "@/features/inventory/schemas";
import { createShipment } from "@/features/orders/actions";

export type ShippableLine = {
  orderItemId: string;
  variantId: string | null;
  title: string;
  sku: string;
  tracking: Tracking;
  /** Allocated to this warehouse and not yet shipped. */
  remaining: number;
};

type CreateShipmentDialogProps = {
  organizationSlug: string;
  orderId: string;
  warehouse: { id: string; name: string };
  lines: ShippableLine[];
};

type LineState = { quantity: string; serials: string[] };

/** Pick and pack the lines waiting at one warehouse. */
export function CreateShipmentDialog({
  organizationSlug,
  orderId,
  warehouse,
  lines,
}: CreateShipmentDialogProps) {
  const [open, setOpen] = useState(false);
  const total = lines.reduce((n, l) => n + l.remaining, 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PackagePlusIcon />
          Ship {total} from {warehouse.name}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pack a shipment from {warehouse.name}</DialogTitle>
          <DialogDescription>
            Stock leaves the warehouse when you pack. Serial-tracked items need the exact units;
            batches are picked first-expiry-first-out automatically.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ShipmentForm
            organizationSlug={organizationSlug}
            orderId={orderId}
            warehouse={warehouse}
            lines={lines}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ShipmentForm({
  organizationSlug,
  orderId,
  warehouse,
  lines,
  onDone,
}: CreateShipmentDialogProps & { onDone: () => void }) {
  const [state, setState] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(
      lines.map((l) => [l.orderItemId, { quantity: String(l.remaining), serials: [] }]),
    ),
  );
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [eta, setEta] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serialOptions, setSerialOptions] = useState<Record<string, string[] | null>>({});
  const [isPending, startTransition] = useTransition();

  // Units in stock for each serial-tracked line.
  useEffect(() => {
    let cancelled = false;
    for (const line of lines) {
      if (line.tracking !== "serial" || !line.variantId) continue;
      void listInStockSerials({
        organizationSlug,
        variantId: line.variantId,
        warehouseId: warehouse.id,
      }).then((result) => {
        if (!cancelled)
          setSerialOptions((s) => ({ ...s, [line.orderItemId]: result.ok ? result.data : [] }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [lines, organizationSlug, warehouse.id]);

  const update = (id: string, patch: Partial<LineState>) =>
    setState((s) => ({ ...s, [id]: { ...s[id]!, ...patch } }));

  const submit = () =>
    startTransition(async () => {
      const next: Record<string, string> = {};
      for (const line of lines) {
        const qty = Number(state[line.orderItemId]?.quantity);
        if (!Number.isInteger(qty) || qty < 0 || qty > line.remaining) {
          next[line.orderItemId] = `Ship 0 to ${line.remaining}`;
        } else if (
          line.tracking === "serial" &&
          qty > 0 &&
          state[line.orderItemId]!.serials.length !== qty
        ) {
          next[line.orderItemId] = `Pick ${qty} unit${qty === 1 ? "" : "s"}`;
        }
      }
      setErrors(next);
      if (Object.keys(next).length > 0) return;

      const result = await createShipment({
        organizationSlug,
        orderId,
        warehouseId: warehouse.id,
        items: lines.map((l) => ({
          orderItemId: l.orderItemId,
          quantity: Number(state[l.orderItemId]!.quantity),
          serials: l.tracking === "serial" ? state[l.orderItemId]!.serials : [],
        })),
        carrier,
        trackingNumber,
        estimatedDelivery: eta,
      });
      if (!result.ok) {
        setErrors({
          _form:
            result.error.fieldErrors?.trackingNumber?.[0] ??
            result.error.fieldErrors?.items?.[0] ??
            result.error.message,
        });
        return;
      }
      toast.success("Shipment packed");
      onDone();
    });

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <ul className="divide-y rounded-lg border">
        {lines.map((line) => {
          const s = state[line.orderItemId]!;
          const qty = Number(s.quantity) || 0;
          return (
            <li key={line.orderItemId} className="space-y-3 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{line.title}</p>
                  <p className="font-mono text-xs text-muted-foreground">{line.sku}</p>
                </div>
                <Field className="w-24 shrink-0">
                  <FieldLabel htmlFor={`ship-${line.orderItemId}`} className="sr-only">
                    Quantity to ship of {line.title}
                  </FieldLabel>
                  <Input
                    id={`ship-${line.orderItemId}`}
                    inputMode="numeric"
                    value={s.quantity}
                    aria-invalid={Boolean(errors[line.orderItemId])}
                    onChange={(e) =>
                      update(line.orderItemId, {
                        quantity: e.target.value,
                        serials: s.serials.slice(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                  <span className="text-right text-xs text-muted-foreground">
                    of {line.remaining}
                  </span>
                </Field>
              </div>
              {line.tracking === "serial" && qty > 0 && (
                <div className="space-y-2">
                  <p className="flex items-center justify-between text-sm font-medium">
                    Units to ship
                    <Badge variant="secondary">
                      {s.serials.length} / {qty}
                    </Badge>
                  </p>
                  <SerialPicker
                    options={serialOptions[line.orderItemId] ?? null}
                    value={s.serials}
                    max={qty}
                    onChange={(serials) => update(line.orderItemId, { serials })}
                  />
                </div>
              )}
              {errors[line.orderItemId] && <FieldError>{errors[line.orderItemId]}</FieldError>}
            </li>
          );
        })}
      </ul>

      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="ship-carrier">Courier (optional)</FieldLabel>
          <Input
            id="ship-carrier"
            value={carrier}
            placeholder="Delhivery, Blue Dart, own rider…"
            onChange={(e) => setCarrier(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="ship-awb">AWB / tracking no.</FieldLabel>
          <Input
            id="ship-awb"
            value={trackingNumber}
            className="font-mono uppercase"
            onChange={(e) => setTrackingNumber(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="ship-eta">Expected delivery</FieldLabel>
          <DatePicker
            id="ship-eta"
            value={eta}
            onChange={setEta}
            min={toIsoDate(new Date())}
            placeholder="Optional"
            clearable
          />
        </Field>
      </FieldGroup>

      {errors._form && <FieldError>{errors._form}</FieldError>}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isPending}>
          {isPending && <Spinner />}
          Pack shipment
        </Button>
      </DialogFooter>
    </form>
  );
}
