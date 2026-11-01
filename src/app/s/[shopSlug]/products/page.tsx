import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { TemplatePage } from "@/features/design/render/template";

type Props = PageProps<"/s/[shopSlug]/products">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shopSlug } = await params;
  return { title: "All products", alternates: { canonical: routes.storefrontProducts(shopSlug) } };
}

/** Every product: search results, categories, filters. */
export default function ProductsPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] rounded-xl" />}>
      <Products params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Products({ params, searchParams }: Props) {
  const { shopSlug } = await params;
  return (
    <TemplatePage
      shopSlug={shopSlug}
      template="catalogue"
      searchParams={searchParams}
      path={routes.storefrontProducts(shopSlug)}
    />
  );
}
