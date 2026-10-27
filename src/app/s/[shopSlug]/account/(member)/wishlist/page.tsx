import { HeartIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { WishlistButton } from "@/features/shopper/components/wishlist-button";
import { requireAccountPage } from "@/features/shopper/guard";
import { getShopperWishlist } from "@/features/shopper/queries";
import { ProductCard } from "@/features/storefront/components/product-card";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };

type Props = PageProps<"/s/[shopSlug]/account/wishlist">;

export default function WishlistPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <Wishlist params={params} />
    </Suspense>
  );
}

async function Wishlist({ params }: Pick<Props, "params">) {
  const { shopSlug } = await params;
  const { shop } = await requireAccountPage(shopSlug, routes.storefrontWishlist);
  const items = (await getShopperWishlist(shop.id)) ?? [];

  if (items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HeartIcon />
          </EmptyMedia>
          <EmptyTitle>Nothing saved yet</EmptyTitle>
          <EmptyDescription>
            Tap the heart on any product to keep it here for later.
          </EmptyDescription>
        </EmptyHeader>
        <Button asChild>
          <Link href={routes.storefront(shop.slug)}>Browse products</Link>
        </Button>
      </Empty>
    );

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3">
      {items.map((p) => (
        <ProductCard
          key={p.id}
          shopSlug={shop.slug}
          product={p}
          currency={shop.currency}
          action={
            <WishlistButton
              variant="overlay"
              shopSlug={shop.slug}
              productId={p.id}
              productTitle={p.title}
              saved
              signedIn
            />
          }
        />
      ))}
    </div>
  );
}
