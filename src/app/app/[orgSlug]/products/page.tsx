import { PackageIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { SimplePagination } from "@/components/shared/simple-pagination";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { listCategoryTree } from "@/features/catalog/queries";
import { toCategoryOptions } from "@/features/catalog/tree";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { ProductFilters } from "@/features/products/components/product-filters";
import { ProductsTable } from "@/features/products/components/products-table";
import { listProducts } from "@/features/products/queries";
import {
  loadProductListParams,
  serializeProductListParams,
} from "@/features/products/search-params";
import { listShops } from "@/features/shops/queries";

export const metadata: Metadata = { title: "Products" };

type Props = PageProps<"/app/[orgSlug]/products">;

export default function ProductsPage({ params, searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <>
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-9 w-full max-w-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </>
      }
    >
      <ProductsContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ProductsContent({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const filters = await loadProductListParams(searchParams);
  const { organization, role } = await requireMembership(orgSlug);
  const [result, tree, shops] = await Promise.all([
    listProducts(organization.id, filters),
    listCategoryTree(organization.id),
    listShops(organization.id),
  ]);
  const canManage = can(role, "catalog.manage");
  const categories = toCategoryOptions(tree).map(({ id, name, group }) => ({ id, name, group }));
  const filtered = Boolean(filters.q || filters.status || filters.category);

  const newButton = canManage && (
    <Button asChild>
      <Link href={routes.orgNewProduct(orgSlug)}>
        <PlusIcon />
        New product
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Products"
        description="Everything you sell, across every shop, with live stock."
        actions={newButton}
      />
      <ProductFilters categories={categories} />
      {result.items.length > 0 ? (
        <>
          <ProductsTable
            organizationSlug={orgSlug}
            products={result.items}
            currency={shops[0]?.currency ?? "INR"}
          />
          <SimplePagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            noun={result.total === 1 ? "product" : "products"}
            hrefFor={(page) =>
              routes.orgProducts(orgSlug) + serializeProductListParams({ ...filters, page })
            }
          />
        </>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageIcon />
            </EmptyMedia>
            <EmptyTitle>{filtered ? "No matching products" : "No products yet"}</EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Try a different search or clear the filters."
                : "Add your first product. Its category decides the details you fill in and how stock is tracked."}
            </EmptyDescription>
          </EmptyHeader>
          {!filtered && newButton && <EmptyContent>{newButton}</EmptyContent>}
        </Empty>
      )}
    </>
  );
}
