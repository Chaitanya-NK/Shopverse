"use client";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import {
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  LinkIcon,
  MessageCircleIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { routes } from "@/config/routes";
import { confirmDelivery, updateShipmentStatus } from "@/features/orders/actions";
import { SHIPMENT_TRANSITIONS, type ShipmentStatus } from "@/features/orders/schemas";

type NextStatus =
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "failed_attempt"
  | "returned_to_origin"
  | "cancelled";

const ACTION: Record<
  NextStatus,
  { label: string; title: string; hint: string; destructive?: boolean }
> = {
  picked_up: {
    label: "Picked up",
    title: "Mark as picked up",
    hint: "The courier has collected the parcel.",
  },
  in_transit: {
    label: "In transit",
    title: "Update transit",
    hint: "Add where the parcel is now (optional).",
  },
  out_for_delivery: {
    label: "Out for delivery",
    title: "Send out for delivery",
    hint: "A new 6-digit delivery code is created. Share it with the customer; the courier enters it at the door.",
  },
  failed_attempt: {
    label: "Delivery failed",
    title: "Record a failed attempt",
    hint: "Why couldn't it be delivered?",
  },
  returned_to_origin: {
    label: "Returned",
    title: "Returned to origin",
    hint: "The parcel came back. Its items go back into stock as a return.",
    destructive: true,
  },
  cancelled: {
    label: "Cancel shipment",
    title: "Cancel this shipment",
    hint: "Unpack it: items go back on the shelf and stay reserved for this order.",
    destructive: true,
  },
};

export type ShipmentActionTarget = {
  id: string;
  number: string;
  status: ShipmentStatus;
  trackingToken: string;
  shopName: string;
  orderNumber: string;
  recipientPhone: string | null;
};

type ShipmentActionsProps = {
  organizationSlug: string;
  shipment: ShipmentActionTarget;
  size?: "sm" | "default";
};

function trackingUrl(token: string) {
  return `${window.location.origin}${routes.tracking(token)}`;
}

/** Next-step buttons for a shipment, including the OTP hand-off at delivery. */
export function ShipmentActions({ organizationSlug, shipment, size = "sm" }: ShipmentActionsProps) {
  const [pending, setPending] = useState<NextStatus | null>(null);
  const [otp, setOtp] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const next = SHIPMENT_TRANSITIONS[shipment.status] as NextStatus[];
  const awaitingCode = shipment.status === "out_for_delivery";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {awaitingCode && (
        <Button size={size} onClick={() => setConfirmOpen(true)}>
          <ShieldCheckIcon />
          Enter delivery code
        </Button>
      )}
      {next.map((status) => (
        <Button
          key={status}
          size={size}
          variant={
            ACTION[status].destructive
              ? "ghost"
              : awaitingCode
                ? "outline"
                : status === next[0]
                  ? "default"
                  : "outline"
          }
          className={
            ACTION[status].destructive ? "text-destructive hover:text-destructive" : undefined
          }
          onClick={() => setPending(status)}
        >
          {shipment.status === "failed_attempt" && status === "out_for_delivery"
            ? "Retry delivery"
            : ACTION[status].label}
        </Button>
      ))}
      <Button
        size={size}
        variant="ghost"
        onClick={() => {
          void navigator.clipboard.writeText(trackingUrl(shipment.trackingToken));
          toast.success("Tracking link copied");
        }}
      >
        <LinkIcon />
        Tracking link
      </Button>

      {pending && (
        <StatusDialog
          organizationSlug={organizationSlug}
          shipment={shipment}
          status={pending}
          onClose={() => setPending(null)}
          onOtp={setOtp}
        />
      )}
      {otp && <OtpRevealDialog otp={otp} shipment={shipment} onClose={() => setOtp(null)} />}
      {confirmOpen && (
        <ConfirmDeliveryDialog
          organizationSlug={organizationSlug}
          shipment={shipment}
          onClose={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}

function StatusDialog({
  organizationSlug,
  shipment,
  status,
  onClose,
  onOtp,
}: {
  organizationSlug: string;
  shipment: ShipmentActionTarget;
  status: NextStatus;
  onClose: () => void;
  onOtp: (otp: string) => void;
}) {
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const action = ACTION[status];
  const showLocation =
    status === "picked_up" || status === "in_transit" || status === "failed_attempt";

  const submit = () =>
    startTransition(async () => {
      const result = await updateShipmentStatus({
        organizationSlug,
        shipmentId: shipment.id,
        status,
        description,
        location,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success(`${shipment.number}: ${action.label.toLowerCase()}`);
      onClose();
      if (result.data.otp) onOtp(result.data.otp);
    });

  return (
    <Dialog open onOpenChange={(open) => !open && !isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {action.title} · {shipment.number}
            </DialogTitle>
            <DialogDescription>{action.hint}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="shipment-note">
                {status === "failed_attempt" || action.destructive ? "Reason" : "Note"} (optional)
              </FieldLabel>
              <Input
                id="shipment-note"
                value={description}
                maxLength={300}
                placeholder={status === "failed_attempt" ? "Customer not reachable" : ""}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            {showLocation && (
              <Field>
                <FieldLabel htmlFor="shipment-location">Location (optional)</FieldLabel>
                <Input
                  id="shipment-location"
                  value={location}
                  maxLength={120}
                  placeholder="Pune hub"
                  onChange={(e) => setLocation(e.target.value)}
                />
              </Field>
            )}
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                Back
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant={action.destructive ? "destructive" : "default"}
              disabled={isPending}
            >
              {isPending && <Spinner />}
              {action.title}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Shown once: the plain code exists only in this response, the database keeps a hash. */
function OtpRevealDialog({
  otp,
  shipment,
  onClose,
}: {
  otp: string;
  shipment: ShipmentActionTarget;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const message =
    `Your ${shipment.shopName} order ${shipment.orderNumber} is out for delivery. ` +
    `Share this code with the delivery partner only when you receive the parcel: ${otp}. ` +
    `Track it here: ${trackingUrl(shipment.trackingToken)}`;
  const whatsappNumber = shipment.recipientPhone?.replace(/\D/g, "").replace(/^(?=\d{10}$)/, "91");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRoundIcon className="size-5" />
            Delivery code for {shipment.number}
          </DialogTitle>
          <DialogDescription>
            Send it to the customer now. For security it is shown only once and expires in 24 hours.
          </DialogDescription>
        </DialogHeader>
        <p
          className="rounded-xl border bg-muted/40 py-5 text-center font-mono text-4xl font-semibold tracking-[0.4em]"
          aria-label={`Delivery code ${otp.split("").join(" ")}`}
          data-testid="delivery-otp"
        >
          {otp}
        </p>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(message);
              setCopied(true);
            }}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Message copied" : "Copy message"}
          </Button>
          {whatsappNumber && (
            <Button asChild>
              <a
                href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircleIcon />
                Send on WhatsApp
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDeliveryDialog({
  organizationSlug,
  shipment,
  onClose,
}: {
  organizationSlug: string;
  shipment: ShipmentActionTarget;
  onClose: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (value = code) =>
    startTransition(async () => {
      if (!/^\d{6}$/.test(value)) {
        setError("Enter the 6-digit code");
        return;
      }
      const result = await confirmDelivery({
        organizationSlug,
        shipmentId: shipment.id,
        otp: value,
      });
      if (!result.ok) {
        setError(result.error.fieldErrors?.otp?.[0] ?? result.error.message);
        setCode("");
        // The input was disabled while checking; put the cursor back for another try.
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }
      toast.success(`${shipment.number} delivered`);
      onClose();
    });

  return (
    <Dialog open onOpenChange={(open) => !open && !isPending && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Confirm delivery · {shipment.number}</DialogTitle>
            <DialogDescription>Ask the customer for their 6-digit delivery code.</DialogDescription>
          </DialogHeader>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="delivery-code" className="sr-only">
              Delivery code
            </FieldLabel>
            <InputOTP
              ref={inputRef}
              id="delivery-code"
              maxLength={6}
              pattern={REGEXP_ONLY_DIGITS}
              inputMode="numeric"
              autoFocus
              disabled={isPending}
              value={code}
              onChange={(v) => {
                setCode(v);
                setError(null);
              }}
              onComplete={(v: string) => submit(v)}
              containerClassName="justify-center"
              aria-invalid={Boolean(error)}
            >
              <InputOTPGroup>
                {[0, 1, 2].map((i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="size-11 text-lg"
                    aria-invalid={Boolean(error)}
                  />
                ))}
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                {[3, 4, 5].map((i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="size-11 text-lg"
                    aria-invalid={Boolean(error)}
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
            {error && <FieldError className="text-center">{error}</FieldError>}
          </Field>
          <DialogFooter>
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending && <Spinner />}
              Confirm delivery
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
