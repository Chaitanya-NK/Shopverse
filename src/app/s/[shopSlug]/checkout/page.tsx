import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { SignedInCheckout } from "@/features/shopper/components/signed-in-checkout";
import { getShopper } from "@/features/shopper/session";
import { CheckoutFlow } from "@/features/storefront/components/checkout-flow";
import { DiscountCodeForm } from "@/features/storefront/components/discount-code-form";
import { OrderSummaryLines } from "@/features/storefront/components/order-summary-lines";
import { getCart, getQuote, getStorefrontShop } from "@/features/storefront/queries";
import { formatMoney } from "@/lib/format";
import { T } from "@/i18n/client";
import { storefrontTitle } from "@/i18n/server";

export async function generateMetadata({
  params,
}: PageProps<"/s/[shopSlug]/checkout">): Promise<Metadata> {
  const { shopSlug } = await params;
  return { title: await storefrontTitle(shopSlug, "Checkout"), robots: { index: false } };
}

type Props = PageProps<"/s/[shopSlug]/checkout">;

export default function CheckoutPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] rounded-xl" />}>
      <Checkout params={params} />
    </Suspense>
  );
}

async function Checkout({ params }: Pick<Props, "params">) {
  const { shopSlug } = await params;
  const shop = await getStorefrontShop(shopSlug);
  if (!shop) notFound();
  const [items, shopper] = await Promise.all([getCart(shop.id), getShopper(shop.id)]);
  if (items.length === 0 || items.some((i) => i.quantity > i.available))
    redirect(routes.storefrontCart(shop.slug));

  const money = (n: number) => formatMoney(n, shop.currency);
  const quote = await getQuote(shop.id, { email: shopper?.email });

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          <T>Checkout</T>
        </h1>
        {!shop.live ? (
          <p className="rounded-xl border bg-muted/40 p-4 text-sm">
            <T>This shop is a preview. Set it live in Shops → settings to take orders.</T>
          </p>
        ) : shopper ? (
          <SignedInCheckout
            shopSlug={shop.slug}
            currency={shop.currency}
            total={quote.total}
            email={shopper.email}
            name={shopper.name}
            phone={shopper.phone}
            addresses={shopper.addresses}
            paymentMethods={shop.paymentMethods}
            codLimit={shop.codLimit}
            messageChannel={shop.messageChannel}
          />
        ) : (
          <>
            <p className="rounded-xl border bg-muted/40 p-4 text-sm">
              <T>Have an account?</T>{" "}
              <Link
                href={routes.storefrontSignIn(shop.slug, routes.storefrontCheckout(shop.slug))}
                className="font-medium underline-offset-4 hover:underline"
              >
                <T>Sign in</T>
              </Link>{" "}
              <T>to use your saved addresses. Or check out as a guest below.</T>
            </p>
            <CheckoutFlow
              shopSlug={shop.slug}
              currency={shop.currency}
              total={quote.total}
              paymentMethods={shop.paymentMethods}
              codLimit={shop.codLimit}
              messageChannel={shop.messageChannel}
            />
          </>
        )}
      </div>
      <Card className="h-fit lg:sticky lg:top-24">
        <CardHeader>
          <CardTitle>
            <T>Your order</T>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-3 text-sm">
            {items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate">{item.productTitle}</span>
                  <span className="text-muted-foreground">
                    {item.title !== "Default" && `${item.title} · `}
                    <T vars={{ count: item.quantity }}>{"Qty {count}"}</T>
                  </span>
                </span>
                <span className="tabular-nums">{money(item.price * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="border-t pt-3">
            <OrderSummaryLines quote={quote} currency={shop.currency} />
          </div>
          <DiscountCodeForm
            shopSlug={shop.slug}
            appliedCode={quote.code}
            appliedTitle={quote.discount?.title ?? null}
            problem={quote.error}
          />
          <Link
            href={routes.storefrontCart(shop.slug)}
            className="block text-center text-sm text-muted-foreground hover:underline"
          >
            <T>Edit cart</T>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
