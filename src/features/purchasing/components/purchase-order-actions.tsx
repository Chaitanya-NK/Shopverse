"use client";

import { PencilIcon, PrinterIcon, SendIcon, TagIcon, XCircleIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { routes } from "@/config/routes";
import { closePurchaseOrder, placePurchaseOrder } from "@/features/purchasing/actions";
import { ReceiveDialog } from "@/features/purchasing/components/receive-dialog";
import { type PurchaseOrderDetail } from "@/features/purchasing/queries";

export function PurchaseOrderActions({
  organizationSlug,
  po,
  canManage,
  canReceive,
}: {
  organizationSlug: string;
  po: PurchaseOrderDetail;
  canManage: boolean;
  canReceive: boolean;
}) {
  const router = useRouter();
  const received = po.lines.filter((l) => l.receivedQuantity > 0);
  const labelsHref =
    routes.orgBarcodeLabels(organizationSlug) +
    `?v=${received.map((l) => `${l.variantId}:${l.receivedQuantity}`).join(",")}`;
  const open = po.status === "ordered" || po.status === "partially_received";
  const anyReceived = received.length > 0;

  return (
    <div className="flex flex-wrap gap-2">
      {canManage && po.status === "draft" && (
        <>
          <Button asChild variant="outline">
            <Link href={routes.orgEditPurchaseOrder(organizationSlug, po.id)}>
              <PencilIcon />
              Edit
            </Link>
          </Button>
          <PlaceDialog organizationSlug={organizationSlug} po={po} />
        </>
      )}
      {canReceive && open && (
        <ReceiveDialog
          organizationSlug={organizationSlug}
          purchaseOrderId={po.id}
          warehouseName={po.warehouse.name}
          lines={po.lines}
        />
      )}
      <Button asChild variant="outline">
        <Link href={routes.orgPrintPurchaseOrder(organizationSlug, po.id)}>
          <PrinterIcon />
          Print
        </Link>
      </Button>
      {anyReceived && (
        <Button asChild variant="outline">
          <Link href={labelsHref}>
            <TagIcon />
            Barcode labels
          </Link>
        </Button>
      )}
      {canManage && (po.status === "draft" || open) && (
        <ConfirmDialog
          title={anyReceived ? `Close ${po.number}?` : `Cancel ${po.number}?`}
          description={
            anyReceived
              ? "What's already received stays in stock. Nothing more will be received on this order."
              : "The supplier won't deliver against this order. This can't be undone."
          }
          confirmLabel={anyReceived ? "Close order" : "Cancel order"}
          trigger={
            <Button variant="ghost" className="text-destructive hover:text-destructive">
              <XCircleIcon />
              {anyReceived ? "Close" : "Cancel order"}
            </Button>
          }
          onConfirm={async () => {
            const result = await closePurchaseOrder({ organizationSlug, purchaseOrderId: po.id });
            if (!result.ok) {
              toast.error(result.error.message);
              return false;
            }
            toast.success(result.data.status === "closed" ? "Order closed" : "Order cancelled");
            router.refresh();
            return true;
          }}
        />
      )}
    </div>
  );
}

function PlaceDialog({
  organizationSlug,
  po,
}: {
  organizationSlug: string;
  po: PurchaseOrderDetail;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(Boolean(po.supplier.email));
  const [isPending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <SendIcon />
          Place order
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Place {po.number}?</DialogTitle>
          <DialogDescription>
            It can&apos;t be edited after this. You&apos;ll receive goods against it as they arrive.
          </DialogDescription>
        </DialogHeader>
        {po.supplier.email ? (
          <div className="flex items-center gap-2">
            <Checkbox id="po-email" checked={email} onCheckedChange={(v) => setEmail(v === true)} />
            <Label htmlFor="po-email" className="font-normal">
              Email it to {po.supplier.name} ({po.supplier.email})
            </Label>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {po.supplier.name} has no email saved; print the order or share it yourself.
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Not yet</Button>
          </DialogClose>
          <Button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await placePurchaseOrder({
                  organizationSlug,
                  purchaseOrderId: po.id,
                  emailSupplier: email,
                });
                if (!result.ok) {
                  toast.error(result.error.message);
                  return;
                }
                toast.success(
                  result.data.emailed ? `Ordered and emailed to ${po.supplier.name}` : "Ordered",
                );
                setOpen(false);
              })
            }
          >
            {isPending && <Spinner />}
            Place order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
