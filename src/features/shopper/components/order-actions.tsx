"use client";

import { RotateCcwIcon, XCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { routes } from "@/config/routes";
import { cancelMyOrder, reorder } from "@/features/shopper/actions";

/** What a signed-in shopper can do with their own order. */
export function OrderActions({
  shopSlug,
  orderToken,
  orderNumber,
  canCancel,
  size = "default",
}: {
  shopSlug: string;
  orderToken: string;
  orderNumber: string;
  canCancel: boolean;
  size?: "default" | "sm";
}) {
  const router = useRouter();
  const [isReordering, startReorder] = useTransition();

  const buyAgain = () =>
    startReorder(async () => {
      const result = await reorder({ shopSlug, orderToken });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(
        result.data.unavailable > 0
          ? `Added ${result.data.added} item${result.data.added === 1 ? "" : "s"}; ${result.data.unavailable} aren't available`
          : "Added to your cart",
      );
      router.push(routes.storefrontCart(shopSlug));
    });

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size={size} onClick={buyAgain} disabled={isReordering}>
        {isReordering ? <Spinner /> : <RotateCcwIcon />}
        Buy again
      </Button>
      {canCancel && (
        <CancelOrderDialog
          shopSlug={shopSlug}
          orderToken={orderToken}
          orderNumber={orderNumber}
          size={size}
        />
      )}
    </div>
  );
}

function CancelOrderDialog({
  shopSlug,
  orderToken,
  orderNumber,
  size,
}: {
  shopSlug: string;
  orderToken: string;
  orderNumber: string;
  size: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  const cancel = () =>
    startTransition(async () => {
      const result = await cancelMyOrder({ shopSlug, orderToken, reason });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`Order ${orderNumber} cancelled`);
      setOpen(false);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size={size} className="text-destructive hover:text-destructive">
          <XCircleIcon />
          Cancel order
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel order {orderNumber}?</DialogTitle>
          <DialogDescription>
            It hasn&apos;t been packed yet, so you can cancel it now. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="cancel-reason">Reason (optional)</FieldLabel>
          <Textarea
            id="cancel-reason"
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ordered by mistake, found a better price…"
          />
          <FieldDescription>Helps the shop improve.</FieldDescription>
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Keep order</Button>
          </DialogClose>
          <Button variant="destructive" onClick={cancel} disabled={isPending}>
            {isPending && <Spinner />}
            Cancel order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
