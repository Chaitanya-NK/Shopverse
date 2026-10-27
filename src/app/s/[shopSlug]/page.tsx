import { PackageSearchIcon, TruckIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { SimplePagination } from "@/components/shared/simple-pagination";
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
import { getShopper } from "@/features/shopper/session";
import { ProductCard } from "@/features/storefront/components/product-card";
import { SortSelect } from "@/features/storefront/components/sort-select";
import {
  getCatalog,
  getStorefrontCategories,
  getStorefrontShop,
} from "@/features/storefront/queries";
import { loadCatalogParams, serializeCatalogParams } from "@/features/storefront/search-params";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = PageProps<"/s/[shopSlug]">;

export default function StorefrontHome({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<CatalogSkeleton />}>
      <Catalog params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Catalog({ params, searchParams }: Props) {
  const { shopSlug } = await params;
  const filters = await loadCatalogParams(searchParams);
  const shop = await getStorefrontShop(shopSlug);
  if (!shop) notFound();

  const [catalog, categories, shopper] = await Promise.all([
    getCatalog(shop.id, filters),
    getStorefrontCategories(shop.id),
    getShopper(shop.id),
  ]);
  const saved = new Set(shopper?.wishlist);
  const activeCategory = categories.find((c) => c.id === filters.category);
  const browsing = Boolean(filters.q || filters.category);
  const href = (patch: Partial<typeof filters>) =>
    routes.storefront(shop.slug) + serializeCatalogParams({ ...filters, page: 1, ...patch });

  return (
    <div className="space-y-8">
      {!browsing && (
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary/70 px-6 py-12 text-primary-foreground sm:px-10 sm:py-16">
          <h1 className="max-w-xl text-3xl font-semibold tracking-tight sm:text-5xl">
            {shop.name}
          </h1>
          {shop.tagline && <p className="mt-3 max-w-xl text-lg opacity-90">{shop.tagline}</p>}
          <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary-foreground/15 px-4 py-2 text-sm">
            <TruckIcon className="size-4" aria-hidden />
            {shop.freeShippingOver !== null
              ? `Free delivery over ${formatMoney(shop.freeShippingOver, shop.currency)}`
              : shop.shippingFee > 0
                ? `Delivery ${formatMoney(shop.shippingFee, shop.currency)}`
                : "Free delivery"}
            {" · Cash on delivery"}
          </p>
        </section>
      )}

      {categories.length > 0 && (
        <nav aria-label="Categories" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <CategoryChip href={href({ category: null })} active={!filters.category}>
            All
          </CategoryChip>
          {categories.map((c) => (
            <CategoryChip
              key={c.id}
              href={href({ category: c.id })}
              active={c.id === filters.category}
            >
              {c.name}
            </CategoryChip>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {filters.q ? `Results for “${filters.q}”` : (activeCategory?.name ?? "All products")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {catalog.total} product{catalog.total === 1 ? "" : "s"}
          </p>
        </div>
        <SortSelect />
      </div>

      {catalog.items.length > 0 ? (
        <>
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
              hrefFor={(page) =>
                routes.storefront(shop.slug) + serializeCatalogParams({ ...filters, page })
              }
            />
          )}
        </>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageSearchIcon />
            </EmptyMedia>
            <EmptyTitle>{browsing ? "Nothing matches" : "New arrivals coming soon"}</EmptyTitle>
            <EmptyDescription>
              {browsing
                ? "Try another search or category."
                : "This shop hasn’t listed any products yet."}
            </EmptyDescription>
          </EmptyHeader>
          {browsing && (
            <Button asChild variant="outline">
              <Link href={routes.storefront(shop.slug)}>See everything</Link>
            </Button>
          )}
        </Empty>
      )}
    </div>
  );
}

function CategoryChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "shrink-0 rounded-full border px-4 py-1.5 text-sm whitespace-nowrap transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
      )}
    >
      {children}
    </Link>
  );
}

function CatalogSkeleton() {
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
