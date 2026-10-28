import { ArrowLeftIcon, FileTextIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { routes } from "@/config/routes";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { ReturnActions } from "@/features/returns/components/return-actions";
import { ReturnStatusBadge } from "@/features/returns/components/return-status-badge";
import { getReturn } from "@/features/returns/queries";
import {
  REFUND_METHOD_LABELS,
  REFUND_STATUS_LABELS,
  RETURN_REASON_LABELS,
} from "@/features/returns/schemas";
import { PAYMENT_METHOD_LABELS } from "@/features/orders/schemas";
import { listOrderPayments } from "@/features/payments/queries";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Return" };

type Props = PageProps<"/app/[orgSlug]/returns/[returnId]">;

const timeFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

export default function ReturnPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <>
          <Skeleton className="h-16 w-96" />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <Skeleton className="h-96 rounded-xl" />
            <Skeleton className="h-80 rounded-xl" />
          </div>
        </>
      }
    >
      <ReturnContent params={params} />
    </Suspense>
  );
}

async function ReturnContent({ params }: Pick<Props, "params">) {
  const { orgSlug, returnId } = await params;
  if (!z.uuid().safeParse(returnId).success) notFound();
  const { organization, role } = await requireMembership(orgSlug);
  const ret = await getReturn(organization.id, returnId);
  if (!ret) notFound();
  const money = (n: number) => formatMoney(n, ret.order.currency);
  // Money still held from an online payment goes back the same way.
  const paidOnline = (await listOrderPayments(ret.order.id)).some(
    (p) =>
      (p.status === "captured" || p.status === "partially_refunded") && p.amount > p.refundedAmount,
  );
  const t = ret.timeline;
  const steps = [
    ["Requested", t.createdAt],
    ["Approved", t.approvedAt],
    ["Declined", t.rejectedAt],
    ["Withdrawn", t.cancelledAt],
    ["Picked up", t.pickedUpAt],
    ["Received", t.receivedAt],
    ["Completed", t.completedAt],
  ].filter((s): s is [string, string] => Boolean(s[1]));
  const received = ret.items.some((i) => i.value !== null);

  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href={routes.orgReturns(orgSlug)}>
            <ArrowLeftIcon />
            Returns
          </Link>
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-2xl font-semibold tracking-tight">{ret.number}</h1>
              <ReturnStatusBadge status={ret.status} />
              <Badge variant="outline">
                {ret.resolution === "exchange" ? "Exchange" : "Refund"}
              </Badge>
              {ret.source === "rto" && <Badge variant="outline">Undelivered</Badge>}
              {ret.refundStatus && ret.refundStatus !== "not_needed" && (
                <Badge variant={ret.refundStatus === "failed" ? "destructive" : "secondary"}>
                  {REFUND_STATUS_LABELS[ret.refundStatus]}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Order{" "}
              <Link
                href={routes.orgOrder(orgSlug, ret.order.id)}
                className="font-mono hover:underline"
              >
                {ret.order.number}
              </Link>{" "}
              · {ret.order.shopName} ·{" "}
              {ret.source === "customer"
                ? "requested by the customer"
                : ret.source === "staff"
                  ? "started by staff"
                  : "returned to origin"}{" "}
              {timeFormat.format(new Date(t.createdAt))}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ret.creditNoteNumber && (
              <Button asChild variant="outline">
                <Link href={routes.orgCreditNote(orgSlug, ret.id)}>
                  <FileTextIcon />
                  Credit note {ret.creditNoteNumber}
                </Link>
              </Button>
            )}
            <ReturnActions
              organizationSlug={orgSlug}
              ret={ret}
              canManage={can(role, "returns.manage")}
              canRefund={can(role, "returns.refund")}
              paidOnline={paidOnline}
            />
          </div>
        </div>
        {ret.refundError && ret.refundStatus === "failed" && (
          <p className="text-sm text-destructive">Last refund attempt: {ret.refundError}</p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
              <CardDescription>
                {received
                  ? "Values are what the customer paid for these units, after discounts."
                  : "Values are fixed and the credit note issued when the items are received."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="pl-3">Item</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Paid each</TableHead>
                      <TableHead className="pr-3 text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ret.items.map((i) => (
                      <TableRow key={i.id} className="align-top">
                        <TableCell className="pl-3 whitespace-normal">
                          <span className="block font-medium">{i.title}</span>
                          <span className="block font-mono text-xs text-muted-foreground">
                            {i.sku}
                          </span>
                          {i.exchangeFor && (
                            <span className="block text-xs">Exchange for: {i.exchangeFor}</span>
                          )}
                          {i.restock !== null && (
                            <span className="block text-xs text-muted-foreground">
                              {i.restock ? "Back in stock" : "Kept aside (damaged)"}
                              {i.serialNumbers.length > 0 && ` · ${i.serialNumbers.join(", ")}`}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{i.quantity}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {money(i.unitPaid)}
                        </TableCell>
                        <TableCell className="pr-3 text-right font-mono tabular-nums">
                          {i.value === null ? "—" : money(i.value)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Reason</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">{RETURN_REASON_LABELS[ret.reason]}</p>
              {ret.note && <p className="whitespace-pre-line text-muted-foreground">{ret.note}</p>}
              {ret.staffNote && (
                <p className="rounded-md bg-muted px-3 py-2">
                  <span className="font-medium">
                    {ret.status === "rejected" ? "Declined: " : "Note to customer: "}
                  </span>
                  {ret.staffNote}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Money</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Order paid by</dt>
                  <dd>
                    {ret.order.paymentMethod ? PAYMENT_METHOD_LABELS[ret.order.paymentMethod] : "—"}
                  </dd>
                </div>
                {received && (
                  <>
                    {ret.shippingCredit > 0 && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Delivery credited</dt>
                        <dd className="font-mono tabular-nums">{money(ret.shippingCredit)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Credit note value</dt>
                      <dd className="font-mono tabular-nums">{money(ret.creditTotal)}</dd>
                    </div>
                    {ret.resolution === "refund" && (
                      <div className="flex justify-between gap-4 border-t pt-1.5 font-medium">
                        <dt>Refund</dt>
                        <dd className="font-mono tabular-nums">
                          {money(ret.refundedAmount)} of {money(ret.refundAmount)}
                        </dd>
                      </div>
                    )}
                  </>
                )}
                {ret.refundMethod && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Refunded by</dt>
                    <dd>
                      {REFUND_METHOD_LABELS[ret.refundMethod]}
                      {ret.refundReference && (
                        <span className="block font-mono text-xs text-muted-foreground">
                          {ret.refundReference}
                        </span>
                      )}
                    </dd>
                  </div>
                )}
                {ret.refunds.map((r) => (
                  <div
                    key={r.id}
                    className="flex justify-between gap-4 text-xs text-muted-foreground"
                  >
                    <dt className="font-mono">{r.id}</dt>
                    <dd className="font-mono tabular-nums">{money(r.amount)}</dd>
                  </div>
                ))}
                {ret.refundUpi && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Customer&apos;s UPI id</dt>
                    <dd className="font-mono">{ret.refundUpi}</dd>
                  </div>
                )}
                {ret.exchangeOrder && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Replacement</dt>
                    <dd>
                      <Link
                        href={routes.orgOrder(orgSlug, ret.exchangeOrder.id)}
                        className="font-mono hover:underline"
                      >
                        {ret.exchangeOrder.number}
                      </Link>
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">{ret.order.customer.name ?? "—"}</p>
              {ret.order.customer.email && (
                <p className="text-muted-foreground">{ret.order.customer.email}</p>
              )}
              {ret.order.customer.phone && (
                <p className="text-muted-foreground">{ret.order.customer.phone}</p>
              )}
              {ret.order.address && (
                <p className="pt-1 text-muted-foreground">Pickup from {ret.order.address}</p>
              )}
            </CardContent>
          </Card>

          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm">
                {steps.map(([label, at]) => (
                  <li key={label} className="flex justify-between gap-4">
                    <span>{label}</span>
                    <time dateTime={at} className="text-muted-foreground">
                      {timeFormat.format(new Date(at))}
                    </time>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
