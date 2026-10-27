import { MapPinIcon, TruckIcon, WarehouseIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ShipmentActions } from "@/features/orders/components/shipment-actions";
import { ShipmentStatusBadge } from "@/features/orders/components/status-badges";
import { type ShipmentDetail } from "@/features/orders/queries";
import { shipmentEventText } from "@/features/orders/schemas";

const timeFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});
const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
});

type ShipmentCardProps = {
  organizationSlug: string;
  shipment: ShipmentDetail;
  order: { number: string; shopName: string; recipientPhone: string };
  canManage: boolean;
};

export function ShipmentCard({ organizationSlug, shipment, order, canManage }: ShipmentCardProps) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span className="font-mono">{shipment.number}</span>
          <ShipmentStatusBadge status={shipment.status} />
          {shipment.deliveryAttempts > 1 && (
            <Badge variant="outline" className="font-normal">
              Attempt {shipment.deliveryAttempts}
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <WarehouseIcon className="size-3.5" aria-hidden />
            {shipment.warehouseName}
          </span>
          {(shipment.carrier || shipment.trackingNumber) && (
            <span className="inline-flex items-center gap-1.5">
              <TruckIcon className="size-3.5" aria-hidden />
              {shipment.carrier}
              {shipment.trackingNumber && (
                <span className="font-mono">{shipment.trackingNumber}</span>
              )}
            </span>
          )}
          {shipment.estimatedDelivery && shipment.status !== "delivered" && (
            <span>Expected {dateFormat.format(new Date(shipment.estimatedDelivery))}</span>
          )}
        </CardDescription>
        {shipment.status === "out_for_delivery" && shipment.otpExpiresAt && (
          <CardAction>
            <Badge
              variant="secondary"
              className="border-transparent bg-warning font-normal text-warning-foreground"
            >
              Code {shipment.otpAttempts > 0 ? `· ${shipment.otpAttempts} wrong` : "sent"}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-1.5 text-sm">
          {shipment.items.map((item) => (
            <li key={item.orderItemId} className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-muted-foreground tabular-nums">{item.quantity} ×</span>
              <span>{item.title}</span>
              {item.serials.length > 0 && (
                <span className="font-mono text-xs text-muted-foreground">
                  {item.serials.join(", ")}
                </span>
              )}
              {item.batches.length > 0 && (
                <span className="font-mono text-xs text-muted-foreground">
                  batch {item.batches.join(", ")}
                </span>
              )}
            </li>
          ))}
        </ul>

        {canManage && (
          <ShipmentActions
            organizationSlug={organizationSlug}
            shipment={{
              id: shipment.id,
              number: shipment.number,
              status: shipment.status,
              trackingToken: shipment.trackingToken,
              shopName: order.shopName,
              orderNumber: order.number,
              recipientPhone: order.recipientPhone,
            }}
          />
        )}

        <ol
          className="relative space-y-3 border-l pl-4 text-sm"
          aria-label={`${shipment.number} tracking history`}
        >
          {shipment.events.map((e, i) => (
            <li key={e.id} className="relative">
              <span
                className={
                  i === 0
                    ? "absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-primary ring-4 ring-background"
                    : "absolute top-1.5 -left-[20px] size-2 rounded-full bg-muted-foreground/40 ring-4 ring-background"
                }
                aria-hidden
              />
              <p className={i === 0 ? "font-medium" : undefined}>
                {shipmentEventText(e.status, e.description)}
              </p>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                {timeFormat.format(new Date(e.occurredAt))}
                {e.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPinIcon className="size-3" aria-hidden />
                    {e.location}
                  </span>
                )}
              </p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
