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
import { getCart, getStorefrontShop } from "@/features/storefront/queries";
import { shippingFor } from "@/features/storefront/schemas";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

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
  const subtotal = items.reduce((n, i) => n + i.price * i.quantity, 0);
  const shipping = shippingFor(subtotal, shop);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
        {!shop.live ? (
          <p className="rounded-xl border bg-muted/40 p-4 text-sm">
            This shop is a preview. Set it live in Shops → settings to take orders.
          </p>
        ) : shopper ? (
          <SignedInCheckout
            shopSlug={shop.slug}
            currency={shop.currency}
            total={subtotal + shipping}
            email={shopper.email}
            name={shopper.name}
            phone={shopper.phone}
            addresses={shopper.addresses}
            paymentMethods={shop.paymentMethods}
            codLimit={shop.codLimit}
          />
        ) : (
          <>
            <p className="rounded-xl border bg-muted/40 p-4 text-sm">
              Have an account?{" "}
              <Link
                href={routes.storefrontSignIn(shop.slug, routes.storefrontCheckout(shop.slug))}
                className="font-medium underline-offset-4 hover:underline"
              >
                Sign in
              </Link>{" "}
              to use your saved addresses. Or check out as a guest below.
            </p>
            <CheckoutFlow
              shopSlug={shop.slug}
              currency={shop.currency}
              total={subtotal + shipping}
              paymentMethods={shop.paymentMethods}
              codLimit={shop.codLimit}
            />
          </>
        )}
      </div>
      <Card className="h-fit lg:sticky lg:top-24">
        <CardHeader>
          <CardTitle>Your order</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-3 text-sm">
            {items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate">{item.productTitle}</span>
                  <span className="text-muted-foreground">
                    {item.title !== "Default" && `${item.title} · `}Qty {item.quantity}
                  </span>
                </span>
                <span className="tabular-nums">{money(item.price * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <dl className="space-y-2 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{money(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Delivery</dt>
              <dd className="tabular-nums">{shipping === 0 ? "Free" : money(shipping)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{money(subtotal + shipping)}</dd>
            </div>
          </dl>
          <Link
            href={routes.storefrontCart(shop.slug)}
            className="block text-center text-sm text-muted-foreground hover:underline"
          >
            Edit cart
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
