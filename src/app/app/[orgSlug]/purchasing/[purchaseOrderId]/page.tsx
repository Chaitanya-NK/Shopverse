import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { routes } from "@/config/routes";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { PurchaseOrderStatusBadge } from "@/features/purchasing/components/po-status-badge";
import { PurchaseOrderActions } from "@/features/purchasing/components/purchase-order-actions";
import { getPurchaseOrder } from "@/features/purchasing/queries";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Purchase order" };

type Props = PageProps<"/app/[orgSlug]/purchasing/[purchaseOrderId]">;

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export default function PurchaseOrderPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] rounded-xl" />}>
      <PurchaseOrderView params={params} />
    </Suspense>
  );
}

async function PurchaseOrderView({ params }: Pick<Props, "params">) {
  const { orgSlug, purchaseOrderId } = await params;
  if (!z.uuid().safeParse(purchaseOrderId).success) notFound();
  const { organization, role } = await requireMembership(orgSlug);
  const po = await getPurchaseOrder(organization.id, purchaseOrderId);
  if (!po) notFound();
  const ordered = po.lines.reduce((n, l) => n + l.quantity, 0);
  const received = po.lines.reduce((n, l) => n + l.receivedQuantity, 0);
  const money = (n: number) => formatMoney(n, "INR");
  const facts = [
    ["Created", po.createdAt],
    ["Ordered", po.orderedAt],
    ["Fully received", po.receivedAt],
    [po.status === "cancelled" ? "Cancelled" : "Closed", po.closedAt],
  ].filter((f): f is [string, string] => Boolean(f[1]));

  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href={routes.orgPurchasing(orgSlug)}>
            <ArrowLeftIcon />
            Purchasing
          </Link>
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-2xl font-semibold tracking-tight">{po.number}</h1>
              <PurchaseOrderStatusBadge status={po.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {po.supplier.name} → {po.warehouse.name}
              {po.expectedAt
                ? ` · expected ${dateFormat.format(new Date(`${po.expectedAt}T00:00:00`))}`
                : ""}
            </p>
          </div>
          <PurchaseOrderActions
            organizationSlug={orgSlug}
            po={po}
            canManage={can(role, "purchasing.manage")}
            canReceive={can(role, "purchasing.receive")}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {po.status !== "draft" && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span>Received</span>
                  <span className="tabular-nums">
                    {received} of {ordered}
                  </span>
                </div>
                <Progress value={ordered ? (received / ordered) * 100 : 0} aria-label="Received" />
              </div>
            )}
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Ordered</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Unit cost</TableHead>
                    <TableHead className="text-right">GST</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {po.lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div className="font-medium">
                          {l.productTitle}
                          {l.title !== "Default" ? ` · ${l.title}` : ""}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {l.sku}
                          {l.tracking !== "quantity" ? ` · by ${l.tracking}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.receivedQuantity}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money(l.unitCost)}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.taxRate}%</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(l.quantity * l.unitCost)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={5} className="text-right">
                      Subtotal
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(po.subtotal)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={5} className="text-right">
                      GST
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(po.taxTotal)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={5} className="text-right font-semibold">
                      Total
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {money(po.total)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
            {po.notes && (
              <p className="text-sm whitespace-pre-line text-muted-foreground">{po.notes}</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Supplier</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">{po.supplier.name}</p>
              {po.supplier.contactName && <p>{po.supplier.contactName}</p>}
              {po.supplier.phone && <p>{po.supplier.phone}</p>}
              {po.supplier.email && <p>{po.supplier.email}</p>}
              {po.supplier.gstin && <p className="font-mono text-xs">GSTIN {po.supplier.gstin}</p>}
              {po.supplierReference && <p>Their ref. {po.supplierReference}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-1.5 text-sm">
                {facts.map(([label, at]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd>{dateFormat.format(new Date(at))}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
