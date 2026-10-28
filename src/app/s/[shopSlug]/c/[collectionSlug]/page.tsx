import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { SimplePagination } from "@/components/shared/simple-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { WishlistButton } from "@/features/shopper/components/wishlist-button";
import { getShopper } from "@/features/shopper/session";
import { ProductCard } from "@/features/storefront/components/product-card";
import { SortSelect } from "@/features/storefront/components/sort-select";
import {
  getCatalog,
  getStorefrontCollections,
  getStorefrontShop,
} from "@/features/storefront/queries";
import { loadCatalogParams, serializeCatalogParams } from "@/features/storefront/search-params";

type Props = PageProps<"/s/[shopSlug]/c/[collectionSlug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shopSlug, collectionSlug } = await params;
  const shop = await getStorefrontShop(shopSlug);
  const collection = shop
    ? (await getStorefrontCollections(shop.id)).find((c) => c.slug === collectionSlug)
    : null;
  if (!shop || !collection) return { title: "Not found" };
  return {
    title: collection.title,
    description: collection.description ?? `${collection.title} at ${shop.name}`,
    alternates: { canonical: routes.storefrontCollection(shop.slug, collection.slug) },
  };
}

export default function CollectionPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <Collection params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Collection({ params, searchParams }: Props) {
  const { shopSlug, collectionSlug } = await params;
  const filters = await loadCatalogParams(searchParams);
  const shop = await getStorefrontShop(shopSlug);
  if (!shop) notFound();
  const collection = (await getStorefrontCollections(shop.id)).find(
    (c) => c.slug === collectionSlug,
  );
  if (!collection) notFound();
  const [catalog, shopper] = await Promise.all([
    getCatalog(shop.id, {
      category: null,
      q: "",
      // "Recommended" here is the shop's own order.
      sort: filters.sort === "newest" ? "featured" : filters.sort,
      page: filters.page,
      collection: collection.id,
    }),
    getShopper(shop.id),
  ]);
  const saved = new Set(shopper?.wishlist);
  const path = routes.storefrontCollection(shop.slug, collection.slug);

  return (
    <div className="space-y-8">
      <Link
        href={routes.storefront(shop.slug)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeftIcon className="size-4" aria-hidden />
        All products
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{collection.title}</h1>
          {collection.description && (
            <p className="whitespace-pre-line text-muted-foreground">{collection.description}</p>
          )}
          <p className="text-sm text-muted-foreground">
            {catalog.total} product{catalog.total === 1 ? "" : "s"}
          </p>
        </div>
        <SortSelect />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {catalog.items.map((p) => (
          <ProductCard
            key={p.id}
            shopSlug={shop.slug}
            product={p}
            currency={shop.currency}
            action={
              shop.live && (
                <WishlistButton
                  variant="overlay"
                  shopSlug={shop.slug}
                  productId={p.id}
                  productTitle={p.title}
                  saved={saved.has(p.id)}
                  signedIn={Boolean(shopper)}
                />
              )
            }
          />
        ))}
      </div>
      {catalog.pageCount > 1 && (
        <SimplePagination
          page={catalog.page}
          pageCount={catalog.pageCount}
          total={catalog.total}
          noun="products"
          hrefFor={(page) => path + serializeCatalogParams({ ...filters, page })}
        />
      )}
    </div>
  );
}
