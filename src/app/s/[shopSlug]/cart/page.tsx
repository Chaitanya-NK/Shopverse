import { ShoppingBagIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { CartLineControls } from "@/features/storefront/components/cart-line-controls";
import { ProductVisual } from "@/features/storefront/components/product-visual";
import { getShopper } from "@/features/shopper/session";
import { DiscountCodeForm } from "@/features/storefront/components/discount-code-form";
import { OrderSummaryLines } from "@/features/storefront/components/order-summary-lines";
import { getCart, getQuote, getStorefrontShop } from "@/features/storefront/queries";
import { MAX_LINE_QUANTITY } from "@/features/storefront/schemas";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Cart", robots: { index: false } };

type Props = PageProps<"/s/[shopSlug]/cart">;

export default function CartPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <Cart params={params} />
    </Suspense>
  );
}

async function Cart({ params }: Pick<Props, "params">) {
  const { shopSlug } = await params;
  const shop = await getStorefrontShop(shopSlug);
  if (!shop) notFound();
  const [items, shopper] = await Promise.all([getCart(shop.id), getShopper(shop.id)]);
  const money = (n: number) => formatMoney(n, shop.currency);

  if (items.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShoppingBagIcon />
          </EmptyMedia>
          <EmptyTitle>Your cart is empty</EmptyTitle>
          <EmptyDescription>Find something you like and add it here.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href={routes.storefront(shop.slug)}>Start shopping</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const quote = await getQuote(shop.id, { email: shopper?.email });
  const blocked = items.some((i) => i.quantity > i.available);
  const toFree =
    shop.freeShippingOver !== null && quote.shipping > 0
      ? shop.freeShippingOver - quote.subtotal
      : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-labelledby="cart-heading" className="space-y-4">
        <h1 id="cart-heading" className="text-2xl font-semibold tracking-tight">
          Your cart
        </h1>
        <ul className="divide-y rounded-2xl border">
          {items.map((item) => {
            const label =
              item.title === "Default" ? item.productTitle : `${item.productTitle} · ${item.title}`;
            return (
              <li key={item.id} className="flex gap-4 p-4">
                <Link
                  href={routes.storefrontProduct(shop.slug, item.productSlug)}
                  className="w-20 shrink-0 sm:w-24"
                >
                  <ProductVisual
                    image={item.image}
                    alt={item.productTitle}
                    seed={item.id}
                    industry={null}
                    sizes="96px"
                  />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={routes.storefrontProduct(shop.slug, item.productSlug)}
                        className="font-medium hover:underline"
                      >
                        {item.productTitle}
                      </Link>
                      {item.title !== "Default" && (
                        <p className="text-sm text-muted-foreground">{item.title}</p>
                      )}
                    </div>
                    <p className="font-medium tabular-nums">{money(item.price * item.quantity)}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CartLineControls
                      shopSlug={shop.slug}
                      variantId={item.id}
                      quantity={item.quantity}
                      max={Math.min(item.available, MAX_LINE_QUANTITY)}
                      label={label}
                    />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {money(item.price)} each
                    </span>
                  </div>
                  {item.quantity > item.available && (
                    <p className="text-sm text-destructive">
                      {item.available === 0
                        ? "Sold out. Please remove it."
                        : `Only ${item.available} left. Please reduce the quantity.`}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <Card className="h-fit lg:sticky lg:top-24">
        <CardHeader>
          <CardTitle>Order summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <OrderSummaryLines quote={quote} currency={shop.currency} />
          <DiscountCodeForm
            shopSlug={shop.slug}
            appliedCode={quote.code}
            appliedTitle={quote.discount?.title ?? null}
            problem={quote.error}
          />
          {toFree !== null && toFree > 0 && (
            <p className="rounded-lg bg-muted p-3 text-sm">
              Add {money(toFree)} more for free delivery.
            </p>
          )}
          {blocked ? (
            <Button className="w-full" size="lg" disabled>
              Fix your cart to continue
            </Button>
          ) : (
            <Button asChild className="w-full" size="lg">
              <Link href={routes.storefrontCheckout(shop.slug)}>Checkout</Link>
            </Button>
          )}
          <p className="text-center text-xs text-muted-foreground">
            Prices include GST.{" "}
            {shop.paymentMethods.includes("online")
              ? shop.paymentMethods.includes("cod")
                ? "Pay online or cash on delivery."
                : "Pay online with UPI, card or net banking."
              : "Pay cash on delivery."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
