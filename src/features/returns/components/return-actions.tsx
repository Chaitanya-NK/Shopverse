"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeftRightIcon,
  BanknoteIcon,
  CheckIcon,
  PackageCheckIcon,
  TruckIcon,
  XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FormRootError } from "@/components/shared/form-root-error";
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { routes } from "@/config/routes";
import {
  markReturnPickedUp,
  receiveReturn,
  recordManualRefund,
  refundReturn,
  reviewReturn,
  sendReplacement,
} from "@/features/returns/actions";
import { type ReturnDetail } from "@/features/returns/queries";
import {
  type ManualRefundInput,
  manualRefundSchema,
  MANUAL_REFUND_METHODS,
  REFUND_METHOD_LABELS,
  type ReviewReturnInput,
  reviewReturnSchema,
} from "@/features/returns/schemas";
import { type ActionResult } from "@/lib/actions/result";
import { formatMoney } from "@/lib/format";
import { applyActionError } from "@/lib/forms/apply-action-error";
import { type z } from "zod";

type Props = {
  organizationSlug: string;
  ret: ReturnDetail;
  canManage: boolean;
  canRefund: boolean;
  /** Paid online with money still held: refunds go back to the original payment. */
  paidOnline: boolean;
};

/** The next step for a return, as buttons. */
export function ReturnActions({ organizationSlug, ret, canManage, canRefund, paidOnline }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const money = (n: number) => formatMoney(n, ret.order.currency);
  const ref = { organizationSlug, returnId: ret.id };

  const run = (action: () => Promise<ActionResult<unknown>>, success: string) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error.message);
      else toast.success(success);
    });

  if (!canManage) return null;
  const refundOpen =
    ret.status === "received" &&
    (ret.refundStatus === "due" || ret.refundStatus === "failed" || ret.refundStuck);

  return (
    <div className="flex flex-wrap gap-2">
      {ret.status === "requested" && (
        <>
          <ReviewDialog organizationSlug={organizationSlug} ret={ret} approve />
          <ReviewDialog organizationSlug={organizationSlug} ret={ret} approve={false} />
        </>
      )}
      {ret.status === "approved" && (
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() => run(() => markReturnPickedUp(ref), "Marked as picked up")}
        >
          {isPending ? <Spinner /> : <TruckIcon />}
          Mark picked up
        </Button>
      )}
      {(ret.status === "approved" || ret.status === "picked_up") && (
        <ReceiveDialog
          organizationSlug={organizationSlug}
          ret={ret}
          canRefund={canRefund}
          paidOnline={paidOnline}
        />
      )}
      {refundOpen &&
        canRefund &&
        (paidOnline ? (
          <Button
            disabled={isPending}
            onClick={() =>
              run(
                () => refundReturn(ref),
                `Refunded ${money(ret.refundAmount - ret.refundedAmount)}`,
              )
            }
          >
            {isPending ? <Spinner /> : <BanknoteIcon />}
            {ret.refundStatus === "due" ? "Refund" : "Retry refund"}{" "}
            {money(ret.refundAmount - ret.refundedAmount)}
          </Button>
        ) : (
          <ManualRefundDialog organizationSlug={organizationSlug} ret={ret} />
        ))}
      {refundOpen && !canRefund && (
        <p className="self-center text-sm text-muted-foreground">
          A manager will refund {money(ret.refundAmount)}.
        </p>
      )}
      {ret.status === "received" && ret.resolution === "exchange" && !ret.exchangeOrder && (
        <Button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await sendReplacement(ref);
              if (!result.ok) {
                toast.error(result.error.message);
                return;
              }
              toast.success("Replacement order created");
              router.push(routes.orgOrder(organizationSlug, result.data.orderId));
            })
          }
        >
          {isPending ? <Spinner /> : <ArrowLeftRightIcon />}
          Send replacement
        </Button>
      )}
    </div>
  );
}

function ReviewDialog({
  organizationSlug,
  ret,
  approve,
}: {
  organizationSlug: string;
  ret: ReturnDetail;
  approve: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const form = useForm<ReviewReturnInput, unknown, z.output<typeof reviewReturnSchema>>({
    resolver: zodResolver(reviewReturnSchema),
    defaultValues: { organizationSlug, returnId: ret.id, approve, note: "" },
  });
  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await reviewReturn(values);
      if (!result.ok) {
        applyActionError(form, result.error);
        return;
      }
      toast.success(approve ? "Return approved" : "Return declined");
      setOpen(false);
    }),
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={approve ? "default" : "outline"}>
          {approve ? <CheckIcon /> : <XIcon />}
          {approve ? "Approve" : "Decline"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{approve ? `Approve ${ret.number}?` : `Decline ${ret.number}?`}</DialogTitle>
          <DialogDescription>
            {approve
              ? "The customer is emailed to keep the items packed for pickup."
              : "The customer is emailed with your reason."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Controller
            control={form.control}
            name="note"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`review-note-${approve}`}>
                  {approve ? "Message to the customer (optional)" : "Reason"}
                </FieldLabel>
                <Textarea
                  id={`review-note-${approve}`}
                  rows={3}
                  maxLength={500}
                  placeholder={
                    approve
                      ? "e.g. Our courier will collect it on Friday."
                      : "e.g. The item was used."
                  }
                  {...field}
                  aria-invalid={fieldState.invalid}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <FormRootError form={form} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant={approve ? "default" : "destructive"}
              disabled={isPending}
            >
              {isPending && <Spinner />}
              {approve ? "Approve return" : "Decline return"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Check the parcel in: what goes back on the shelf, and which serial numbers came back. */
function ReceiveDialog({
  organizationSlug,
  ret,
  canRefund,
  paidOnline,
}: {
  organizationSlug: string;
  ret: ReturnDetail;
  canRefund: boolean;
  paidOnline: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [restock, setRestock] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ret.items.map((i) => [i.id, ret.reason !== "damaged"])),
  );
  const [serials, setSerials] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      ret.items.map((i) => [i.id, i.shippedSerials.length === i.quantity ? i.shippedSerials : []]),
    ),
  );
  const [error, setError] = useState<string | null>(null);

  const submit = () =>
    startTransition(async () => {
      setError(null);
      for (const item of ret.items) {
        if (item.tracking === "serial" && (serials[item.id]?.length ?? 0) !== item.quantity) {
          setError(
            `Choose ${item.quantity} serial number${item.quantity === 1 ? "" : "s"} for ${item.title}.`,
          );
          return;
        }
      }
      const result = await receiveReturn({
        organizationSlug,
        returnId: ret.id,
        items: ret.items.map((i) => ({
          returnItemId: i.id,
          restock: restock[i.id] ?? true,
          serialNumbers: i.tracking === "serial" ? serials[i.id] : [],
        })),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      const { refund } = result.data;
      toast.success(
        refund === "sent"
          ? "Received and refunded to the original payment"
          : refund === "failed"
            ? "Received. The refund didn't go through; try again from this page."
            : "Return received",
      );
      setOpen(false);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PackageCheckIcon />
          Receive items
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Receive {ret.number}</DialogTitle>
          <DialogDescription>
            Check the items. Good ones go back into stock at the warehouse they shipped from;
            damaged ones are kept aside. A GST credit note is issued
            {ret.resolution === "refund"
              ? paidOnline && canRefund
                ? " and the refund goes to the original payment."
                : "; record the refund once you've paid it."
              : " and you can send the replacement."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {ret.items.map((item) => (
            <FieldSet key={item.id} className="rounded-lg border p-3">
              <FieldLegend variant="label">
                {item.quantity} × {item.title}
              </FieldLegend>
              <Field orientation="horizontal">
                <Switch
                  id={`restock-${item.id}`}
                  checked={restock[item.id] ?? true}
                  onCheckedChange={(on) => setRestock((r) => ({ ...r, [item.id]: on }))}
                />
                <FieldLabel htmlFor={`restock-${item.id}`} className="font-normal">
                  Put back in stock
                </FieldLabel>
              </Field>
              {item.tracking === "serial" && (
                <FieldGroup className="gap-2">
                  <FieldDescription>Serial numbers that came back</FieldDescription>
                  {item.shippedSerials.map((sn) => (
                    <Field key={sn} orientation="horizontal">
                      <Checkbox
                        id={`sn-${item.id}-${sn}`}
                        checked={serials[item.id]?.includes(sn) ?? false}
                        onCheckedChange={(on) =>
                          setSerials((s) => ({
                            ...s,
                            [item.id]: on
                              ? [...(s[item.id] ?? []), sn]
                              : (s[item.id] ?? []).filter((x) => x !== sn),
                          }))
                        }
                      />
                      <FieldLabel htmlFor={`sn-${item.id}-${sn}`} className="font-mono font-normal">
                        {sn}
                      </FieldLabel>
                    </Field>
                  ))}
                </FieldGroup>
              )}
            </FieldSet>
          ))}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={submit} disabled={isPending}>
            {isPending && <Spinner />}
            Receive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManualRefundDialog({
  organizationSlug,
  ret,
}: {
  organizationSlug: string;
  ret: ReturnDetail;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const form = useForm<ManualRefundInput, unknown, z.output<typeof manualRefundSchema>>({
    resolver: zodResolver(manualRefundSchema),
    defaultValues: { organizationSlug, returnId: ret.id, method: "upi", reference: "" },
  });
  const method = useWatch({ control: form.control, name: "method" });
  const amount = formatMoney(ret.refundAmount, ret.order.currency);
  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await recordManualRefund(values);
      if (!result.ok) {
        applyActionError(form, result.error);
        return;
      }
      toast.success("Refund recorded");
      setOpen(false);
    }),
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <BanknoteIcon />
          Record refund of {amount}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record the refund</DialogTitle>
          <DialogDescription>
            Pay {amount} to the customer first
            {ret.refundUpi ? (
              <>
                {" "}
                (UPI id <span className="font-mono text-foreground">{ret.refundUpi}</span>)
              </>
            ) : null}
            , then record how. The customer is emailed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Controller
            control={form.control}
            name="method"
            render={({ field }) => (
              <FieldSet>
                <FieldLegend variant="label">Paid by</FieldLegend>
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="flex flex-wrap gap-4"
                >
                  {MANUAL_REFUND_METHODS.map((m) => (
                    <Field key={m} orientation="horizontal" className="w-auto">
                      <RadioGroupItem id={`refund-${m}`} value={m} />
                      <FieldLabel htmlFor={`refund-${m}`} className="font-normal">
                        {REFUND_METHOD_LABELS[m]}
                      </FieldLabel>
                    </Field>
                  ))}
                </RadioGroup>
              </FieldSet>
            )}
          />
          {method !== "cash" && (
            <Controller
              control={form.control}
              name="reference"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="refund-reference">
                    {method === "upi" ? "UPI transaction id (UTR)" : "Bank reference"}
                  </FieldLabel>
                  <Input
                    id="refund-reference"
                    autoComplete="off"
                    {...field}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          )}
          <FormRootError form={form} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner />}
              Record refund
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
