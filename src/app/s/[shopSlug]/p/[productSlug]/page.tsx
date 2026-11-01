import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { env } from "@/env";
import { productImageUrl } from "@/features/products/images";
import { TemplatePage } from "@/features/design/render/template";
import { getStorefrontProduct, getStorefrontShop } from "@/features/storefront/queries";

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

export default function ProductPage({ params, searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <div className="grid gap-10 md:grid-cols-2">
          <Skeleton className="aspect-square rounded-2xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      }
    >
      <Product params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Product({ params, searchParams }: Props) {
  const { shopSlug, productSlug } = await params;
  const shop = await getStorefrontShop(shopSlug);
  if (!shop) notFound();
  const product = await getStorefrontProduct(shop.id, productSlug);
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
    aggregateRating: product.rating
      ? {
          "@type": "AggregateRating",
          ratingValue: product.rating.average,
          reviewCount: product.rating.count,
        }
      : undefined,
  };

  return (
    <>
      <script
        type="application/ld+json"
        // JSON, with "<" escaped so text can't close the script element.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <TemplatePage
        shopSlug={shopSlug}
        template="product"
        searchParams={searchParams}
        path={routes.storefrontProduct(shop.slug, product.slug)}
        productSlug={product.slug}
      />
    </>
  );
}
