import {
  CheckCircle2Icon,
  FileTextIcon,
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
import { PayNowButton } from "@/features/payments/components/pay-now-button";
import { PaymentReturn } from "@/features/payments/components/payment-return";
import { OrderProgress } from "@/features/shopper/components/order-progress";
import { type OrderStage } from "@/features/shopper/stages";
import { ProductVisual } from "@/features/storefront/components/product-visual";
import { OrderReturns } from "@/features/returns/components/order-returns";
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

const timeFormat = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

const HEADLINE: Record<OrderStage, string> = {
  awaiting_payment: "Complete your payment",
  placed: "Order received",
  confirmed: "Order confirmed",
  packed: "Packed and ready to ship",
  shipped: "On its way",
  out_for_delivery: "Out for delivery today",
  delivered: "Delivered",
  returned: "Returned to the shop",
  cancelled: "Order cancelled",
};

export default function CustomerOrderPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-[32rem] max-w-2xl rounded-xl" />}>
      <CustomerOrder params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CustomerOrder({ params, searchParams }: Props) {
  const { shopSlug, token } = await params;
  const { checkout } = await searchParams;
  const [order, shop] = await Promise.all([getCustomerOrder(token), getStorefrontShop(shopSlug)]);
  if (!order || !shop || order.shop.slug !== shopSlug) notFound();
  const [access, shopper] = await Promise.all([
    getOrderAccess(shop.id, token),
    getShopper(shop.id),
  ]);
  const money = (n: number) => formatMoney(n, order.currency);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {typeof checkout === "string" && /^(cancelled|cs_[A-Za-z0-9_]{8,200})$/.test(checkout) && (
        <PaymentReturn
          orderToken={token}
          checkout={checkout}
          path={routes.storefrontOrder(shopSlug, token)}
        />
      )}
      <div className="space-y-2 text-center">
        {order.status === "cancelled" ? (
          <XCircleIcon className="mx-auto size-12 text-muted-foreground" aria-hidden />
        ) : (
          <CheckCircle2Icon className="mx-auto size-12 text-emerald-600" aria-hidden />
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{HEADLINE[order.stage]}</h1>
        <p className="text-muted-foreground">
          Order <span className="font-mono font-medium text-foreground">{order.number}</span> ·
          placed {dateFormat.format(new Date(order.placed_at))}
        </p>
        {order.invoice_number && (
          <div className="flex justify-center pt-2">
            <Button asChild variant="outline" size="sm">
              <Link href={routes.storefrontInvoice(shop.slug, token)}>
                <FileTextIcon />
                Invoice {order.invoice_number}
              </Link>
            </Button>
          </div>
        )}
        {access ? (
          <div className="flex justify-center pt-2">
            <OrderActions
              shopSlug={shop.slug}
              orderToken={token}
              orderNumber={order.number}
              canCancel={access.canCancel}
              canReturn={access.canReturn}
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
              with the email you ordered with to cancel, return, reorder or see all your orders.
            </p>
          )
        )}
      </div>

      {order.stage === "awaiting_payment" && order.payment_due_at && (
        <Card className="border-primary">
          <CardContent className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              We&apos;re holding your items until{" "}
              <span className="font-medium text-foreground">
                {timeFormat.format(new Date(order.payment_due_at))}
              </span>
              . Pay now to confirm the order; otherwise it&apos;s cancelled automatically.
            </p>
            <PayNowButton orderToken={token} amount={order.grand_total} currency={order.currency} />
          </CardContent>
        </Card>
      )}

      {order.stage !== "cancelled" &&
        order.stage !== "returned" &&
        order.stage !== "awaiting_payment" && (
          <Card>
            <CardContent>
              <OrderProgress stage={order.stage} />
            </CardContent>
          </Card>
        )}

      <OrderReturns
        returns={order.returns}
        currency={order.currency}
        shopSlug={shop.slug}
        orderToken={token}
        owner={Boolean(access)}
      />

      {order.shipments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TruckIcon className="size-5" aria-hidden />
              Delivery
            </CardTitle>
            {order.stage === "out_for_delivery" && (
              <CardDescription>
                We&apos;ve emailed your delivery code. Share it with the courier only once you have
                the parcel.
              </CardDescription>
            )}
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
              <li key={i} className="flex items-center gap-3">
                <ProductVisual
                  image={item.image}
                  alt={item.title}
                  seed={item.title}
                  industry={null}
                  sizes="48px"
                  className="size-12 shrink-0 rounded-lg [&_svg]:size-5"
                />
                <span className="min-w-0 flex-1">
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
            {order.discount_total > 0 && (
              <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                <dt>
                  {order.discount_code
                    ? `Discount (${order.discount_code})`
                    : (order.discount_title ?? "Discount")}
                </dt>
                <dd className="tabular-nums">−{money(order.discount_total)}</dd>
              </div>
            )}
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
                (order.payment_status === "pending" || order.payment_status === "authorized")
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
