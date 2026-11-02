import { ArrowLeftIcon, ClockIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { ShopPayment } from "@/features/payments/components/shop-payment";
import { ProductVisual } from "@/features/storefront/components/product-visual";
import { getCustomerOrder, getStorefrontShop } from "@/features/storefront/queries";
import { INTL_LOCALE } from "@/i18n/core";
import { getT } from "@/i18n/server";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = {
  title: "Payment",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = PageProps<"/s/[shopSlug]/orders/[token]/pay">;

export default function PaymentPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-[32rem] max-w-4xl rounded-xl" />}>
      <Payment params={params} />
    </Suspense>
  );
}

async function Payment({ params }: Pick<Props, "params">) {
  const { shopSlug, token } = await params;
  const [order, shop] = await Promise.all([getCustomerOrder(token), getStorefrontShop(shopSlug)]);
  if (!order || !shop || order.shop.slug !== shopSlug) notFound();
  // Paid, cancelled or cash on delivery: nothing to pay here.
  if (order.stage !== "awaiting_payment") redirect(routes.storefrontOrder(shopSlug, token));

  const t = await getT(shop.language);
  const money = (n: number) => formatMoney(n, order.currency);
  const holdUntil = order.payment_due_at
    ? new Intl.DateTimeFormat(INTL_LOCALE[t.locale], {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      }).format(new Date(order.payment_due_at))
    : null;

  return (
    <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start">
      <div className="space-y-6">
        <div className="space-y-1">
          <Link
            href={routes.storefrontOrder(shopSlug, token)}
            className="inline-flex min-h-6 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-4" aria-hidden />
            {t("Back to your order")}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{t("Payment")}</h1>
          <p className="text-muted-foreground">
            {t("Order")}{" "}
            <span className="font-mono font-medium text-foreground">{order.number}</span> ·{" "}
            {money(order.grand_total)}
          </p>
        </div>
        {holdUntil && (
          <p className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <ClockIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              {t("We're holding your items until {time}. Pay before then to confirm the order.", {
                time: holdUntil,
              })}
            </span>
          </p>
        )}
        <Card>
          <CardContent>
            <ShopPayment
              shopSlug={shopSlug}
              orderToken={token}
              payLabel={t("Pay {amount}", { amount: money(order.grand_total) })}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Order summary")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-3 text-sm">
            {order.items.map((item, i) => (
              <li key={i} className="flex items-center gap-3">
                <ProductVisual
                  image={item.image}
                  alt={item.title}
                  seed={item.title}
                  industry={null}
                  sizes="40px"
                  className="size-10 shrink-0 rounded-md [&_svg]:size-4"
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
              <dt className="text-muted-foreground">{t("Subtotal")}</dt>
              <dd className="tabular-nums">{money(order.subtotal)}</dd>
            </div>
            {order.discount_total > 0 && (
              <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                <dt>
                  {order.discount_code
                    ? t("Discount ({code})", { code: order.discount_code })
                    : (order.discount_title ?? t("Discount"))}
                </dt>
                <dd className="tabular-nums">−{money(order.discount_total)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("Delivery")}</dt>
              <dd className="tabular-nums">
                {order.shipping_total === 0 ? t("Free") : money(order.shipping_total)}
              </dd>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <dt>{t("Total")}</dt>
              <dd className="tabular-nums">{money(order.grand_total)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
