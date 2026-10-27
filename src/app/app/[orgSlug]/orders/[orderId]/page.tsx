import { ArrowLeftIcon, FileTextIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
import {
  CreateShipmentDialog,
  type ShippableLine,
} from "@/features/orders/components/create-shipment-dialog";
import { OrderActions } from "@/features/orders/components/order-actions";
import { OrderNotes } from "@/features/orders/components/order-notes";
import { ShipmentCard } from "@/features/orders/components/shipment-card";
import {
  FulfillmentBadge,
  OrderStatusBadge,
  PaymentBadge,
} from "@/features/orders/components/status-badges";
import { getOrder, type OrderDetail } from "@/features/orders/queries";
import { ACTIVE_SHIPMENT_STATUSES, PAYMENT_METHOD_LABELS } from "@/features/orders/schemas";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Order" };

type Props = PageProps<"/app/[orgSlug]/orders/[orderId]">;

const timeFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

export default function OrderPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <>
          <Skeleton className="h-16 w-96" />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <Skeleton className="h-[28rem] rounded-xl" />
            <Skeleton className="h-80 rounded-xl" />
          </div>
        </>
      }
    >
      <OrderContent params={params} />
    </Suspense>
  );
}

/** For each warehouse, the lines still waiting to ship from it. */
function shippableByWarehouse(order: OrderDetail) {
  const byWarehouse = new Map<
    string,
    { warehouse: { id: string; name: string }; lines: ShippableLine[] }
  >();
  for (const line of order.lines) {
    for (const a of line.allocations) {
      const remaining = a.quantity - a.shipped;
      if (remaining <= 0) continue;
      const entry = byWarehouse.get(a.warehouseId) ?? {
        warehouse: { id: a.warehouseId, name: a.warehouseName },
        lines: [],
      };
      entry.lines.push({
        orderItemId: line.id,
        variantId: line.variantId,
        title: line.title,
        sku: line.sku,
        tracking: line.tracking,
        remaining,
      });
      byWarehouse.set(a.warehouseId, entry);
    }
  }
  return [...byWarehouse.values()];
}

async function OrderContent({ params }: Pick<Props, "params">) {
  const { orgSlug, orderId } = await params;
  if (!z.uuid().safeParse(orderId).success) notFound();

  const { organization, role } = await requireMembership(orgSlug);
  const order = await getOrder(organization.id, orderId);
  if (!order) notFound();

  const canManage = can(role, "orders.manage");
  const toShip = order.status === "confirmed" ? shippableByWarehouse(order) : [];
  const totalUnits = order.lines.reduce((n, l) => n + l.quantity, 0);
  const shippedUnits = order.lines.reduce((n, l) => n + l.fulfilledQuantity, 0);
  const money = (n: number) => formatMoney(n, order.currency);
  const a = order.address;

  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href={routes.orgOrders(orgSlug)}>
            <ArrowLeftIcon />
            Orders
          </Link>
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-2xl font-semibold tracking-tight">{order.number}</h1>
              <OrderStatusBadge status={order.status} />
              <PaymentBadge status={order.paymentStatus} />
              <FulfillmentBadge status={order.fulfillmentStatus} />
            </div>
            <p className="text-sm text-muted-foreground">
              {timeFormat.format(new Date(order.placedAt))} · {order.shopName}
              {order.paymentMethod && ` · ${PAYMENT_METHOD_LABELS[order.paymentMethod]}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {order.invoiceNumber && (
              <Button asChild variant="outline">
                <Link href={routes.orgOrderInvoice(orgSlug, order.id)}>
                  <FileTextIcon />
                  Invoice {order.invoiceNumber}
                </Link>
              </Button>
            )}
            {canManage && (
              <OrderActions
                organizationSlug={orgSlug}
                canCancel={can(role, "orders.cancel")}
                order={{
                  id: order.id,
                  number: order.number,
                  status: order.status,
                  paymentStatus: order.paymentStatus,
                  paymentMethod: order.paymentMethod,
                  hasLiveShipments: order.shipments.some((s) =>
                    [...ACTIVE_SHIPMENT_STATUSES, "delivered"].includes(s.status),
                  ),
                }}
              />
            )}
          </div>
        </div>
        {order.status === "cancelled" && order.cancelReason && (
          <p className="text-sm text-muted-foreground">Cancelled: {order.cancelReason}</p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
              <CardDescription className="flex items-center gap-3">
                <Progress
                  value={totalUnits ? (shippedUnits / totalUnits) * 100 : 0}
                  className="h-1.5 w-32"
                  aria-label="Shipped"
                />
                {shippedUnits} of {totalUnits} shipped
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="pl-3">Product</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="pr-3 text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="pl-3 whitespace-normal">
                          {line.productId ? (
                            <Link
                              href={routes.orgProduct(orgSlug, line.productId)}
                              className="font-medium hover:underline"
                            >
                              {line.title}
                            </Link>
                          ) : (
                            <span className="font-medium">{line.title}</span>
                          )}
                          <span className="block font-mono text-xs text-muted-foreground">
                            {line.sku}
                          </span>
                          {line.allocations.length > 0 && (
                            <span className="mt-1 flex flex-wrap gap-1">
                              {line.allocations.map((al) => (
                                <Badge
                                  key={al.warehouseId}
                                  variant="outline"
                                  className="font-normal"
                                >
                                  {al.warehouseName} · {al.shipped}/{al.quantity} shipped
                                </Badge>
                              ))}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(line.unitPrice)}
                        </TableCell>
                        <TableCell className="pr-3 text-right tabular-nums">
                          {money(line.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
                <TotalRow label="Subtotal" value={money(order.subtotal)} />
                {order.discountTotal > 0 && (
                  <TotalRow label="Discount" value={`− ${money(order.discountTotal)}`} />
                )}
                {order.shippingTotal > 0 && (
                  <TotalRow label="Shipping" value={money(order.shippingTotal)} />
                )}
                <TotalRow label="Total" value={money(order.grandTotal)} strong />
                <p className="text-right text-xs text-muted-foreground">
                  Includes {money(order.taxTotal)} GST
                </p>
              </dl>
              {canManage && toShip.length > 0 && (
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  {toShip.map((group) => (
                    <CreateShipmentDialog
                      key={group.warehouse.id}
                      organizationSlug={orgSlug}
                      orderId={order.id}
                      warehouse={group.warehouse}
                      lines={group.lines}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {order.shipments.length > 0 && (
            <section className="space-y-4" aria-labelledby="shipments-heading">
              <h2 id="shipments-heading" className="text-lg font-semibold">
                Shipments
              </h2>
              {order.shipments.map((shipment) => (
                <ShipmentCard
                  key={shipment.id}
                  organizationSlug={orgSlug}
                  shipment={shipment}
                  canManage={canManage}
                  order={{
                    number: order.number,
                    shopName: order.shopName,
                    recipientPhone: a.phone,
                  }}
                />
              ))}
            </section>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {order.customer ? (
                <Link
                  href={routes.orgCustomer(orgSlug, order.customer.id)}
                  className="font-medium hover:underline"
                >
                  {order.customer.name ?? a.name}
                </Link>
              ) : (
                <p className="font-medium">{a.name}</p>
              )}
              {(order.customer?.phone ?? a.phone) && (
                <a
                  className="block text-muted-foreground hover:underline"
                  href={`tel:${order.customer?.phone ?? a.phone}`}
                >
                  {order.customer?.phone ?? a.phone}
                </a>
              )}
              {order.customer?.email && (
                <a
                  className="block text-muted-foreground hover:underline"
                  href={`mailto:${order.customer.email}`}
                >
                  {order.customer.email}
                </a>
              )}
            </CardContent>
          </Card>
          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Deliver to</CardTitle>
            </CardHeader>
            <CardContent>
              <address className="text-sm leading-relaxed text-muted-foreground not-italic">
                <span className="font-medium text-foreground">{a.name}</span>
                <br />
                {a.line1}
                {a.line2 && (
                  <>
                    <br />
                    {a.line2}
                  </>
                )}
                <br />
                {a.city}, {a.state} {a.postalCode}
                <br />
                {a.phone}
              </address>
            </CardContent>
          </Card>
          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Note</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderNotes
                key={order.updatedAt}
                organizationSlug={orgSlug}
                orderId={order.id}
                initial={order.notes}
                canEdit={canManage}
              />
            </CardContent>
          </Card>
          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                {order.events.map((e) => (
                  <li key={e.id}>
                    <p>{e.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {timeFormat.format(new Date(e.createdAt))}
                    </p>
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

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={
        strong ? "flex justify-between border-t pt-1.5 font-semibold" : "flex justify-between"
      }
    >
      <dt className={strong ? undefined : "text-muted-foreground"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
