import { ChevronLeftIcon, ShieldCheckIcon, ShoppingBagIcon, TruckIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SimplePagination } from "@/components/shared/simple-pagination";
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
import { routes } from "@/config/routes";
import { deliveryNote } from "@/features/design/queries";
import { ProductCards } from "@/features/design/render/catalogue";
import { type SectionProps } from "@/features/design/render/context";
import {
  num,
  ProductGridLayout,
  SectionFrame,
  SectionHeading,
  str,
} from "@/features/design/render/frame";
import { ProductReviews } from "@/features/reviews/components/product-reviews";
import { StarRating } from "@/features/reviews/components/star-rating";
import { WishlistButton } from "@/features/shopper/components/wishlist-button";
import { getShopper } from "@/features/shopper/session";
import { CartLineControls } from "@/features/storefront/components/cart-line-controls";
import { DiscountCodeForm } from "@/features/storefront/components/discount-code-form";
import { OrderSummaryLines } from "@/features/storefront/components/order-summary-lines";
import { ProductGallery } from "@/features/storefront/components/product-gallery";
import { ProductPurchase } from "@/features/storefront/components/product-purchase";
import { ProductVisual } from "@/features/storefront/components/product-visual";
import { SelectedVariantProvider } from "@/features/storefront/components/selected-variant";
import { SortSelect } from "@/features/storefront/components/sort-select";
import {
  getCart,
  getCatalog,
  getQuote,
  getRelatedProducts,
  getStorefrontCollections,
  getStorefrontProduct,
} from "@/features/storefront/queries";
import { MAX_LINE_QUANTITY } from "@/features/storefront/schemas";
import { loadCatalogParams, serializeCatalogParams } from "@/features/storefront/search-params";
import { formatMoney } from "@/lib/format";
import { type Translate } from "@/i18n/core";
import { cn } from "@/lib/utils";

function formatDetail(value: unknown, unit: string | null, t: Translate): string {
  if (typeof value === "boolean") return value ? t("Yes") : t("No");
  if (Array.isArray(value)) return value.join(", ");
  return `${String(value)}${unit ? ` ${unit}` : ""}`;
}

// ------------------------------------------------------------------ product
export async function ProductMainSection({ section, ctx }: SectionProps) {
  const s = section.settings;
  const { shop } = ctx;
  const product = ctx.productSlug ? await getStorefrontProduct(shop.id, ctx.productSlug) : null;
  if (!product) notFound();

  return (
    <SectionFrame id={section.id} className="space-y-6">
      {s.showBreadcrumb !== false && (
        <Link
          href={
            product.category
              ? routes.storefrontCategory(shop.slug, product.category.id)
              : routes.storefrontProducts(shop.slug)
          }
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" aria-hidden />
          {product.category?.name ?? ctx.t("All products")}
        </Link>
      )}

      <SelectedVariantProvider initial={null}>
        <div className="grid gap-10 md:grid-cols-2">
          <div className={cn(s.gallery === "right" && "md:order-last")}>
            <ProductGallery
              images={product.images}
              title={product.title}
              seed={product.id}
              industry={product.category?.industry ?? null}
            />
          </div>

          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-3xl font-semibold tracking-tight">{product.title}</h1>
              {shop.live && (
                <WishlistButton
                  shopSlug={shop.slug}
                  productId={product.id}
                  productTitle={product.title}
                  saved={ctx.saved.has(product.id)}
                  signedIn={ctx.signedIn}
                />
              )}
            </div>
            {product.rating && (
              <a
                href="#reviews"
                className="-mt-4 flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <StarRating value={product.rating.average} size="md" />
                <span>
                  {product.rating.average.toFixed(1)} ·{" "}
                  {ctx.t.plural(product.rating.count, "{count} review", "{count} reviews")}
                </span>
              </a>
            )}
            <ProductPurchase shopSlug={shop.slug} product={product} currency={shop.currency} />

            {s.showPromises !== false && (
              <ul className="space-y-2 rounded-xl border p-4 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <TruckIcon className="size-4 shrink-0" aria-hidden />
                  {shop.freeShippingOver !== null
                    ? ctx.t("Free delivery on orders over {amount}", {
                        amount: formatMoney(shop.freeShippingOver, shop.currency),
                      })
                    : deliveryNote(shop, ctx.t)}
                </li>
                {shop.paymentMethods.includes("cod") && (
                  <li className="flex items-center gap-2">
                    <ShieldCheckIcon className="size-4 shrink-0" aria-hidden />
                    {ctx.t("Cash on delivery. Hand over the parcel only with your delivery code.")}
                  </li>
                )}
              </ul>
            )}

            {s.showDescription !== false && product.description && (
              <section className="space-y-2">
                <h2 className="font-medium">{ctx.t("About this item")}</h2>
                <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                  {product.description}
                </p>
              </section>
            )}

            {s.showDetails !== false && product.details.length > 0 && (
              <section className="space-y-2">
                <h2 className="font-medium">{ctx.t("Details")}</h2>
                <dl className="divide-y rounded-xl border text-sm">
                  {product.details.map((d) => (
                    <div
                      key={d.label}
                      className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 px-4 py-2.5"
                    >
                      <dt className="text-muted-foreground">{d.label}</dt>
                      <dd>{formatDetail(d.value, d.unit, ctx.t)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>
        </div>
      </SelectedVariantProvider>
    </SectionFrame>
  );
}

export async function ProductReviewsSection({ section, ctx }: SectionProps) {
  const product = ctx.productSlug ? await getStorefrontProduct(ctx.shop.id, ctx.productSlug) : null;
  if (!product) return null;
  return (
    <SectionFrame id={section.id}>
      <ProductReviews shop={ctx.shop} product={product} t={ctx.t} />
    </SectionFrame>
  );
}

export async function RelatedProductsSection({ section, ctx }: SectionProps) {
  const s = section.settings;
  const product = ctx.productSlug ? await getStorefrontProduct(ctx.shop.id, ctx.productSlug) : null;
  if (!product) return null;
  const related = await getRelatedProducts(ctx.shop.id, product.id);
  if (related.length === 0) return null;
  return (
    <SectionFrame id={section.id} label={ctx.t(str(s.heading))} className="border-t pt-10">
      <SectionHeading title={ctx.t(str(s.heading))} />
      <ProductGridLayout layout={str(s.layout)}>
        <ProductCards items={related.slice(0, num(s.count, 4))} ctx={ctx} />
      </ProductGridLayout>
    </SectionFrame>
  );
}

// --------------------------------------------------------------- collection
export async function CollectionMainSection({ section, ctx }: SectionProps) {
  const s = section.settings;
  const { shop } = ctx;
  const filters = await loadCatalogParams(ctx.searchParams);
  const collection = (await getStorefrontCollections(shop.id)).find(
    (c) => c.slug === ctx.collectionSlug,
  );
  if (!collection) notFound();
  const catalog = await getCatalog(shop.id, {
    category: null,
    q: "",
    // "Recommended" here is the shop's own order.
    sort: filters.sort === "newest" ? "featured" : filters.sort,
    page: filters.page,
    collection: collection.id,
  });
  const path = routes.storefrontCollection(shop.slug, collection.slug);

  return (
    <SectionFrame id={section.id} className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{collection.title}</h1>
          {s.showDescription !== false && collection.description && (
            <p className="whitespace-pre-line text-muted-foreground">{collection.description}</p>
          )}
          {s.showCount !== false && (
            <p className="text-sm text-muted-foreground">
              {ctx.t.plural(catalog.total, "{count} product", "{count} products")}
            </p>
          )}
        </div>
        {s.showSort !== false && <SortSelect />}
      </div>
      <ProductGridLayout>
        <ProductCards items={catalog.items} ctx={ctx} />
      </ProductGridLayout>
      {catalog.pageCount > 1 && (
        <SimplePagination
          page={catalog.page}
          pageCount={catalog.pageCount}
          total={catalog.total}
          noun="products"
          t={ctx.t}
          hrefFor={(page) => path + serializeCatalogParams({ ...filters, page })}
        />
      )}
    </SectionFrame>
  );
}

// --------------------------------------------------------------------- cart
export async function CartMainSection({ section, ctx }: SectionProps) {
  const s = section.settings;
  const { shop } = ctx;
  const [items, shopper] = await Promise.all([getCart(shop.id), getShopper(shop.id)]);
  const money = (n: number) => formatMoney(n, shop.currency);
  const { t } = ctx;
  const heading = t(str(s.heading)) || t("Your cart");

  if (items.length === 0) {
    return (
      <SectionFrame id={section.id}>
        <h1 className="sr-only">{heading}</h1>
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShoppingBagIcon />
            </EmptyMedia>
            <EmptyTitle>{t("Your cart is empty")}</EmptyTitle>
            <EmptyDescription>{t("Find something you like and add it here.")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href={routes.storefrontProducts(shop.slug)}>{t("Start shopping")}</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </SectionFrame>
    );
  }

  const quote = await getQuote(shop.id, { email: shopper?.email });
  const blocked = items.some((i) => i.quantity > i.available);
  const toFree =
    shop.freeShippingOver !== null && quote.shipping > 0
      ? shop.freeShippingOver - quote.subtotal
      : null;

  return (
    <SectionFrame id={section.id}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="cart-heading" className="space-y-4">
          <h1 id="cart-heading" className="text-2xl font-semibold tracking-tight">
            {heading}
          </h1>
          <ul className="divide-y rounded-2xl border">
            {items.map((item) => {
              const label =
                item.title === "Default"
                  ? item.productTitle
                  : `${item.productTitle} · ${item.title}`;
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
                      <p className="font-medium tabular-nums">
                        {money(item.price * item.quantity)}
                      </p>
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
                        {t("{amount} each", { amount: money(item.price) })}
                      </span>
                    </div>
                    {item.quantity > item.available && (
                      <p className="text-sm text-destructive">
                        {item.available === 0
                          ? t("Sold out. Please remove it.")
                          : t("Only {count} left. Please reduce the quantity.", {
                              count: item.available,
                            })}
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
            <CardTitle>{t("Order summary")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <OrderSummaryLines quote={quote} currency={shop.currency} />
            {s.showDiscount !== false && (
              <DiscountCodeForm
                shopSlug={shop.slug}
                appliedCode={quote.code}
                appliedTitle={quote.discount?.title ?? null}
                problem={quote.error}
              />
            )}
            {s.showFreeDelivery !== false && toFree !== null && toFree > 0 && (
              <p className="rounded-lg bg-muted p-3 text-sm">
                {t("Add {amount} more for free delivery.", { amount: money(toFree) })}
              </p>
            )}
            {blocked ? (
              <Button className="w-full" size="lg" disabled>
                {t("Fix your cart to continue")}
              </Button>
            ) : (
              <Button asChild className="w-full" size="lg">
                <Link href={routes.storefrontCheckout(shop.slug)}>{t("Checkout")}</Link>
              </Button>
            )}
            <p className="text-center text-xs text-muted-foreground">
              {t("Prices include GST.")}{" "}
              {shop.paymentMethods.includes("online")
                ? shop.paymentMethods.includes("cod")
                  ? t("Pay online or cash on delivery.")
                  : t("Pay online with UPI, card or net banking.")
                : t("Pay cash on delivery.")}
            </p>
          </CardContent>
        </Card>
      </div>
    </SectionFrame>
  );
}
