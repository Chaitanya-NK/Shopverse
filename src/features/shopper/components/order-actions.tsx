"use client";

import { RotateCcwIcon, Undo2Icon, XCircleIcon } from "lucide-react";
import Link from "next/link";
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
import { useT } from "@/i18n/client";

/** What a signed-in shopper can do with their own order. */
export function OrderActions({
  shopSlug,
  orderToken,
  orderNumber,
  canCancel,
  canReturn = false,
  size = "default",
}: {
  shopSlug: string;
  orderToken: string;
  orderNumber: string;
  canCancel: boolean;
  canReturn?: boolean;
  size?: "default" | "sm";
}) {
  const t = useT();
  const router = useRouter();
  const [isReordering, startReorder] = useTransition();

  const buyAgain = () =>
    startReorder(async () => {
      const result = await reorder({ shopSlug, orderToken });
      if (!result.ok) {
        toast.error(t(result.error.message));
        return;
      }
      toast.success(
        result.data.unavailable > 0
          ? t("Added {added}; {unavailable} aren't available", {
              added: t.plural(result.data.added, "{count} item", "{count} items"),
              unavailable: result.data.unavailable,
            })
          : t("Added to your cart"),
      );
      router.push(routes.storefrontCart(shopSlug));
    });

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size={size} onClick={buyAgain} disabled={isReordering}>
        {isReordering ? <Spinner /> : <RotateCcwIcon />}
        {t("Buy again")}
      </Button>
      {canReturn && (
        <Button asChild variant="outline" size={size}>
          <Link href={routes.storefrontReturn(shopSlug, orderToken)}>
            <Undo2Icon />
            {t("Return or exchange")}
          </Link>
        </Button>
      )}
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
  const t = useT();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  const cancel = () =>
    startTransition(async () => {
      const result = await cancelMyOrder({ shopSlug, orderToken, reason });
      if (!result.ok) {
        toast.error(t(result.error.message));
        return;
      }
      toast.success(t("Order {number} cancelled", { number: orderNumber }));
      setOpen(false);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size={size} className="text-destructive hover:text-destructive">
          <XCircleIcon />
          {t("Cancel order")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Cancel order {number}?", { number: orderNumber })}</DialogTitle>
          <DialogDescription>
            {t("It hasn't been packed yet, so you can cancel it now. This can't be undone.")}
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="cancel-reason">{t("Reason (optional)")}</FieldLabel>
          <Textarea
            id="cancel-reason"
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("Ordered by mistake, found a better price…")}
          />
          <FieldDescription>{t("Helps the shop improve.")}</FieldDescription>
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("Keep order")}</Button>
          </DialogClose>
          <Button variant="destructive" onClick={cancel} disabled={isPending}>
            {isPending && <Spinner />}
            {t("Cancel order")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
