import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { TemplatePage } from "@/features/design/render/template";
import { getStorefrontCollections, getStorefrontShop } from "@/features/storefront/queries";

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
  const shop = await getStorefrontShop(shopSlug);
  if (!shop) notFound();
  const collection = (await getStorefrontCollections(shop.id)).find(
    (c) => c.slug === collectionSlug,
  );
  if (!collection) notFound();
  return (
    <TemplatePage
      shopSlug={shopSlug}
      template="collection"
      searchParams={searchParams}
      path={routes.storefrontCollection(shop.slug, collection.slug)}
      collectionSlug={collection.slug}
    />
  );
}
