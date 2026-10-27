"use client";

import { BadgeCheckIcon, BanknoteIcon, XCircleIcon } from "lucide-react";
import { useState, useTransition } from "react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cancelOrder, confirmOrder, markOrderPaid } from "@/features/orders/actions";
import {
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from "@/features/orders/schemas";

type OrderActionsProps = {
  organizationSlug: string;
  order: {
    id: string;
    number: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    paymentMethod: PaymentMethod | null;
    hasLiveShipments: boolean;
  };
  canCancel: boolean;
};

export function OrderActions({ organizationSlug, order, canCancel }: OrderActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"confirm" | "paid" | null>(null);
  const open = order.status === "pending" || order.status === "confirmed";

  const run = (kind: "confirm" | "paid") =>
    startTransition(async () => {
      setBusy(kind);
      const result =
        kind === "confirm"
          ? await confirmOrder({ organizationSlug, orderId: order.id })
          : await markOrderPaid({ organizationSlug, orderId: order.id });
      setBusy(null);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(kind === "confirm" ? "Order confirmed; stock reserved" : "Marked as paid");
    });

  return (
    <div className="flex flex-wrap gap-2">
      {order.status === "pending" && (
        <Button onClick={() => run("confirm")} disabled={isPending}>
          {busy === "confirm" ? <Spinner /> : <BadgeCheckIcon />}
          Confirm & reserve stock
        </Button>
      )}
      {open && order.paymentStatus !== "paid" && order.paymentMethod !== "cod" && (
        <Button variant="outline" onClick={() => run("paid")} disabled={isPending}>
          {busy === "paid" ? <Spinner /> : <BanknoteIcon />}
          Mark as paid
        </Button>
      )}
      {open && canCancel && (
        <CancelOrderDialog
          organizationSlug={organizationSlug}
          order={order}
          disabledReason={order.hasLiveShipments ? "Cancel or return its shipments first." : null}
        />
      )}
    </div>
  );
}

function CancelOrderDialog({
  organizationSlug,
  order,
  disabledReason,
}: {
  organizationSlug: string;
  order: OrderActionsProps["order"];
  disabledReason: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const result = await cancelOrder({ organizationSlug, orderId: order.id, reason });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success(`${order.number} cancelled`);
      setOpen(false);
    });

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="text-destructive hover:text-destructive">
          <XCircleIcon />
          Cancel order
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel {order.number}?</DialogTitle>
          <DialogDescription>
            {disabledReason ??
              "Reserved stock is released. " +
                (order.paymentStatus === "paid"
                  ? "The payment was received, so remember to refund it."
                  : "")}
          </DialogDescription>
        </DialogHeader>
        {!disabledReason && (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="cancel-reason">Reason (optional)</FieldLabel>
            <Textarea
              id="cancel-reason"
              rows={3}
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
            {error && <FieldError>{error}</FieldError>}
          </Field>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Keep order</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={isPending || Boolean(disabledReason)}
          >
            {isPending && <Spinner />}
            Cancel order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
