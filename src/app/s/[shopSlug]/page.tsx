import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { TemplatePage } from "@/features/design/render/template";
import { loadCatalogParams } from "@/features/storefront/search-params";

type Props = PageProps<"/s/[shopSlug]">;

export default function StorefrontHome({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Home params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Home({ params, searchParams }: Props) {
  const { shopSlug } = await params;
  const filters = await loadCatalogParams(searchParams);
  // Searches and category links from before /products existed still work.
  const browsing = Boolean(
    filters.q ||
    filters.category ||
    filters.min !== null ||
    filters.max !== null ||
    filters.stock ||
    filters.page > 1,
  );
  return (
    <TemplatePage
      shopSlug={shopSlug}
      template={browsing ? "catalogue" : "home"}
      searchParams={searchParams}
      path={routes.storefront(shopSlug)}
    />
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-56 rounded-3xl" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="aspect-square rounded-xl" />
        ))}
      </div>
    </div>
  );
}
