import {
  CheckCircle2Icon,
  MailIcon,
  PackageIcon,
  PhoneIcon,
  TruckIcon,
  XCircleIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { SHIPMENT_STATUS_LABELS } from "@/features/orders/schemas";
import { OrderActions } from "@/features/shopper/components/order-actions";
import { getOrderAccess } from "@/features/shopper/queries";
import { getShopper } from "@/features/shopper/session";
import { getCustomerOrder, getStorefrontShop } from "@/features/storefront/queries";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = PageProps<"/s/[shopSlug]/orders/[token]">;

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

const HEADLINE = {
  pending: "Order received",
  confirmed: "Order confirmed",
  completed: "Delivered",
  cancelled: "Order cancelled",
} as const;

export default function CustomerOrderPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-[32rem] max-w-2xl rounded-xl" />}>
      <CustomerOrder params={params} />
    </Suspense>
  );
}

async function CustomerOrder({ params }: Pick<Props, "params">) {
  const { shopSlug, token } = await params;
  const [order, shop] = await Promise.all([getCustomerOrder(token), getStorefrontShop(shopSlug)]);
  if (!order || !shop || order.shop.slug !== shopSlug) notFound();
  const [access, shopper] = await Promise.all([
    getOrderAccess(shop.id, token),
    getShopper(shop.id),
  ]);
  const money = (n: number) => formatMoney(n, order.currency);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2 text-center">
        {order.status === "cancelled" ? (
          <XCircleIcon className="mx-auto size-12 text-muted-foreground" aria-hidden />
        ) : (
          <CheckCircle2Icon className="mx-auto size-12 text-emerald-600" aria-hidden />
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{HEADLINE[order.status]}</h1>
        <p className="text-muted-foreground">
          Order <span className="font-mono font-medium text-foreground">{order.number}</span> ·
          placed {dateFormat.format(new Date(order.placed_at))}
        </p>
        {access ? (
          <div className="flex justify-center pt-2">
            <OrderActions
              shopSlug={shop.slug}
              orderToken={token}
              orderNumber={order.number}
              canCancel={access.canCancel}
            />
          </div>
        ) : (
          !shopper &&
          shop.live && (
            <p className="pt-1 text-sm text-muted-foreground">
              <Link
                href={routes.storefrontSignIn(shop.slug, routes.storefrontOrder(shop.slug, token))}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Sign in
              </Link>{" "}
              with the email you ordered with to cancel, reorder or see all your orders.
            </p>
          )
        )}
      </div>

      {order.shipments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TruckIcon className="size-5" aria-hidden />
              Delivery
            </CardTitle>
            <CardDescription>
              Keep your delivery code handy. Share it only when you have the parcel.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {order.shipments.map((s) => (
              <div
                key={s.tracking_token}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <span>
                  <span className="font-mono">{s.number}</span> · {SHIPMENT_STATUS_LABELS[s.status]}
                </span>
                <Button asChild size="sm" variant="outline">
                  <Link href={routes.tracking(s.tracking_token)}>Track</Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackageIcon className="size-5" aria-hidden />
            Items
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2 text-sm">
            {order.items.map((item, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>
                  {item.quantity} × {item.title}
                </span>
                <span className="tabular-nums">{money(item.total)}</span>
              </li>
            ))}
          </ul>
          <dl className="space-y-1.5 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{money(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Delivery</dt>
              <dd className="tabular-nums">
                {order.shipping_total === 0 ? "Free" : money(order.shipping_total)}
              </dd>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <dt>
                {order.status !== "cancelled" &&
                order.payment_method === "cod" &&
                order.payment_status !== "paid"
                  ? "To pay on delivery"
                  : "Total"}
              </dt>
              <dd className="tabular-nums">{money(order.grand_total)}</dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">
            Delivering to {order.ship_to.name}, {order.ship_to.city}, {order.ship_to.state}{" "}
            {order.ship_to.postal_code}
          </p>
        </CardContent>
      </Card>

      {(order.shop.support_email || order.shop.support_phone) && (
        <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          Questions? Contact {order.shop.name}:
          {order.shop.support_email && (
            <a
              className="inline-flex items-center gap-1 hover:underline"
              href={`mailto:${order.shop.support_email}`}
            >
              <MailIcon className="size-3.5" aria-hidden />
              {order.shop.support_email}
            </a>
          )}
          {order.shop.support_phone && (
            <a
              className="inline-flex items-center gap-1 hover:underline"
              href={`tel:${order.shop.support_phone}`}
            >
              <PhoneIcon className="size-3.5" aria-hidden />
              {order.shop.support_phone}
            </a>
          )}
        </p>
      )}
      <div className="text-center">
        <Button asChild variant="outline">
          <Link href={routes.storefront(order.shop.slug)}>Continue shopping</Link>
        </Button>
      </div>
    </div>
  );
}
