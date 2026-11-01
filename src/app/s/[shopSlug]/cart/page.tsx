import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { TemplatePage } from "@/features/design/render/template";

export const metadata: Metadata = { title: "Cart", robots: { index: false } };

type Props = PageProps<"/s/[shopSlug]/cart">;

export default function CartPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <Cart params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Cart({ params, searchParams }: Props) {
  const { shopSlug } = await params;
  return (
    <TemplatePage
      shopSlug={shopSlug}
      template="cart"
      searchParams={searchParams}
      path={routes.storefrontCart(shopSlug)}
    />
  );
}
