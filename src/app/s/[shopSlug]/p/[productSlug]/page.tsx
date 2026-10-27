import { ChevronLeftIcon, ShieldCheckIcon, TruckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { env } from "@/env";
import { productImageUrl } from "@/features/products/images";
import { WishlistButton } from "@/features/shopper/components/wishlist-button";
import { getShopper } from "@/features/shopper/session";
import { ProductGallery } from "@/features/storefront/components/product-gallery";
import { ProductPurchase } from "@/features/storefront/components/product-purchase";
import { getStorefrontProduct, getStorefrontShop } from "@/features/storefront/queries";
import { formatMoney } from "@/lib/format";

type Props = PageProps<"/s/[shopSlug]/p/[productSlug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shopSlug, productSlug } = await params;
  const shop = await getStorefrontShop(shopSlug);
  const product = shop ? await getStorefrontProduct(shop.id, productSlug) : null;
  if (!shop || !product) return { title: "Not found" };
  const description =
    product.description?.slice(0, 160) ?? `${product.title} from ${shop.name}. Cash on delivery.`;
  const cover = product.images[0];
  return {
    title: product.title,
    description,
    alternates: { canonical: routes.storefrontProduct(shop.slug, product.slug) },
    openGraph: {
      type: "website",
      siteName: shop.name,
      title: product.title,
      description,
      url: routes.storefrontProduct(shop.slug, product.slug),
      images: cover
        ? [
            {
              url: productImageUrl(cover.path, "large"),
              width: cover.width,
              height: cover.height,
              alt: cover.alt ?? product.title,
            },
          ]
        : undefined,
    },
  };
}

export default function ProductPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <div className="grid gap-10 md:grid-cols-2">
          <Skeleton className="aspect-square rounded-2xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      }
    >
      <Product params={params} />
    </Suspense>
  );
}

function formatDetail(value: unknown, unit: string | null): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  return `${String(value)}${unit ? ` ${unit}` : ""}`;
}

async function Product({ params }: Pick<Props, "params">) {
  const { shopSlug, productSlug } = await params;
  const shop = await getStorefrontShop(shopSlug);
  if (!shop) notFound();
  const [product, shopper] = await Promise.all([
    getStorefrontProduct(shop.id, productSlug),
    getShopper(shop.id),
  ]);
  if (!product) notFound();

  const url = new URL(routes.storefrontProduct(shop.slug, product.slug), env.NEXT_PUBLIC_APP_URL);
  const prices = product.variants.map((v) => v.price);
  // Structured data so search engines can show price and availability.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description ?? undefined,
    image: product.images.map((i) => productImageUrl(i.path, "large")),
    sku: product.variants.length === 1 ? product.variants[0]!.sku : undefined,
    category: product.category?.name,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: shop.currency,
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      offerCount: product.variants.length,
      availability: product.variants.some((v) => v.available > 0)
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: url.toString(),
    },
  };

  return (
    <div className="space-y-10">
      <script
        type="application/ld+json"
        // JSON, with "<" escaped so text can't close the script element.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Link
        href={
          product.category
            ? routes.storefrontCategory(shop.slug, product.category.id)
            : routes.storefront(shop.slug)
        }
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeftIcon className="size-4" aria-hidden />
        {product.category?.name ?? "All products"}
      </Link>

      <div className="grid gap-10 md:grid-cols-2">
        <ProductGallery
          images={product.images}
          title={product.title}
          seed={product.id}
          industry={product.category?.industry ?? null}
        />

        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-3xl font-semibold tracking-tight">{product.title}</h1>
            {shop.live && (
              <WishlistButton
                shopSlug={shop.slug}
                productId={product.id}
                productTitle={product.title}
                saved={Boolean(shopper?.wishlist.includes(product.id))}
                signedIn={Boolean(shopper)}
              />
            )}
          </div>
          <ProductPurchase shopSlug={shop.slug} product={product} currency={shop.currency} />

          <ul className="space-y-2 rounded-xl border p-4 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <TruckIcon className="size-4 shrink-0" aria-hidden />
              {shop.freeShippingOver !== null
                ? `Free delivery on orders over ${formatMoney(shop.freeShippingOver, shop.currency)}`
                : shop.shippingFee > 0
                  ? `Delivery ${formatMoney(shop.shippingFee, shop.currency)}`
                  : "Free delivery"}
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheckIcon className="size-4 shrink-0" aria-hidden />
              Cash on delivery. Hand over the parcel only with your delivery code.
            </li>
          </ul>

          {product.description && (
            <section className="space-y-2">
              <h2 className="font-medium">About this item</h2>
              <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                {product.description}
              </p>
            </section>
          )}

          {product.details.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-medium">Details</h2>
              <dl className="divide-y rounded-xl border text-sm">
                {product.details.map((d) => (
                  <div
                    key={d.label}
                    className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 px-4 py-2.5"
                  >
                    <dt className="text-muted-foreground">{d.label}</dt>
                    <dd>{formatDetail(d.value, d.unit)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
