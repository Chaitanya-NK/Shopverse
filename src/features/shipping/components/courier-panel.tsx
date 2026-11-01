"use client";

import { FileTextIcon, PackageIcon, StickerIcon, TruckIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { routes } from "@/config/routes";
import {
  bookCourier,
  cancelCourierBooking,
  quoteCourierRates,
  simulateCourierScan,
} from "@/features/shipping/actions";
import { type CourierRate } from "@/lib/couriers/types";
import { formatMoney } from "@/lib/format";

type Shipment = {
  id: string;
  status: string;
  courier: string | null;
  courierService: string | null;
  trackingNumber: string | null;
  shippingCost: number | null;
  codAmount: number | null;
};

/** Packing slip, label, and the courier booking for one shipment. */
export function CourierPanel({
  organizationSlug,
  shipment,
  courierEnabled,
  canManage,
  defaultWeightGrams,
}: {
  organizationSlug: string;
  shipment: Shipment;
  courierEnabled: boolean;
  canManage: boolean;
  defaultWeightGrams: number;
}) {
  const [isPending, startTransition] = useTransition();
  const booked = Boolean(shipment.courier);
  const live = !["delivered", "returned_to_origin", "cancelled"].includes(shipment.status);

  const simulate = (outcome: "deliver" | "fail") =>
    startTransition(async () => {
      const result = await simulateCourierScan({
        organizationSlug,
        shipmentId: shipment.id,
        outcome,
      });
      if (!result.ok) toast.error(result.error.message);
      else toast.success(`Courier scan: ${result.data.status.replaceAll("_", " ")}`);
    });

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={routes.orgPackingSlip(organizationSlug, shipment.id)}>
            <FileTextIcon />
            Packing slip
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={routes.orgShipmentLabel(organizationSlug, shipment.id)}>
            <StickerIcon />
            Shipping label
          </Link>
        </Button>
        {booked && (
          <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">
              {shipment.courierService
                ? `${shipment.courierService[0]!.toUpperCase()}${shipment.courierService.slice(1)}`
                : "Courier"}
            </Badge>
            {shipment.shippingCost !== null && (
              <span>Cost {formatMoney(shipment.shippingCost, "INR")}</span>
            )}
            {shipment.codAmount !== null && (
              <span>Collect {formatMoney(shipment.codAmount, "INR")}</span>
            )}
          </span>
        )}
        {canManage && !booked && shipment.status === "packed" && courierEnabled && (
          <BookDialog
            organizationSlug={organizationSlug}
            shipmentId={shipment.id}
            defaultWeightGrams={defaultWeightGrams}
          />
        )}
        {canManage && booked && shipment.status === "packed" && (
          <ConfirmDialog
            title="Cancel the courier booking?"
            description={`AWB ${shipment.trackingNumber} is cancelled with the courier. You can book again or ship it yourself.`}
            confirmLabel="Cancel booking"
            trigger={
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                <XIcon />
                Cancel booking
              </Button>
            }
            onConfirm={async () => {
              const result = await cancelCourierBooking({
                organizationSlug,
                shipmentId: shipment.id,
              });
              if (!result.ok) {
                toast.error(result.error.message);
                return false;
              }
              toast.success("Booking cancelled");
              return true;
            }}
          />
        )}
      </div>
      {canManage && booked && shipment.courier === "test" && live && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            Test courier: no real pickup. Move the parcel along:
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => simulate("deliver")}
          >
            {isPending ? <Spinner /> : <TruckIcon />}
            Next scan
          </Button>
          {shipment.status === "out_for_delivery" && (
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => simulate("fail")}>
              Delivery fails
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function BookDialog({
  organizationSlug,
  shipmentId,
  defaultWeightGrams,
}: {
  organizationSlug: string;
  shipmentId: string;
  defaultWeightGrams: number;
}) {
  const [open, setOpen] = useState(false);
  const [parcel, setParcel] = useState({
    weightGrams: String(defaultWeightGrams),
    lengthCm: "25",
    breadthCm: "20",
    heightCm: "10",
  });
  const [quote, setQuote] = useState<{
    courierName: string;
    codAmount: number;
    rates: CourierRate[];
  } | null>(null);
  const [service, setService] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [isPending, startTransition] = useTransition();

  const getRates = () =>
    startTransition(async () => {
      setError(null);
      const result = await quoteCourierRates({ organizationSlug, shipmentId, parcel });
      if (!result.ok) {
        setFieldErrors(result.error.fieldErrors ?? {});
        setError(result.error.fieldErrors ? null : result.error.message);
        setQuote(null);
        return;
      }
      setFieldErrors({});
      setQuote(result.data);
      setService(result.data.rates[0]?.service ?? "");
    });

  const book = () =>
    startTransition(async () => {
      const result = await bookCourier({ organizationSlug, shipmentId, parcel, service });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success(`Booked. AWB ${result.data.awb}`);
      setOpen(false);
    });

  const field = (key: keyof typeof parcel, label: string) => {
    const err = fieldErrors[`parcel.${key}`]?.[0];
    return (
      <Field data-invalid={Boolean(err)}>
        <FieldLabel htmlFor={`parcel-${key}`}>{label}</FieldLabel>
        <Input
          id={`parcel-${key}`}
          inputMode="numeric"
          value={parcel[key]}
          aria-invalid={Boolean(err)}
          onChange={(e) => {
            setParcel((p) => ({ ...p, [key]: e.target.value }));
            setQuote(null);
          }}
        />
        {err && <FieldError>{err}</FieldError>}
      </Field>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setQuote(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <PackageIcon />
          Book courier
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Book a courier</DialogTitle>
          <DialogDescription>
            Weigh and measure the packed parcel, then pick a service.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {field("weightGrams", "Weight (g)")}
          {field("lengthCm", "Length (cm)")}
          {field("breadthCm", "Width (cm)")}
          {field("heightCm", "Height (cm)")}
        </div>
        {!quote ? (
          <Button variant="outline" onClick={getRates} disabled={isPending}>
            {isPending && <Spinner />}
            Get rates
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {quote.courierName}
              {quote.codAmount > 0
                ? ` · collects ${formatMoney(quote.codAmount, "INR")} on delivery`
                : " · prepaid"}
            </p>
            <RadioGroup value={service} onValueChange={setService} className="gap-2">
              {quote.rates.map((r) => (
                <Label
                  key={r.service}
                  htmlFor={`rate-${r.service}`}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-primary"
                >
                  <RadioGroupItem id={`rate-${r.service}`} value={r.service} />
                  <span className="flex-1">
                    <span className="font-medium">{r.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {r.etaDays} day{r.etaDays === 1 ? "" : "s"} · charged as{" "}
                      {r.chargedGrams / 1000} kg
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">{formatMoney(r.price, "INR")}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={book} disabled={!quote || !service || isPending}>
            {isPending && quote && <Spinner />}
            Book and get AWB
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
