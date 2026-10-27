import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { listCategoryTree } from "@/features/catalog/queries";
import { toCategoryOptions } from "@/features/catalog/tree";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { ProductForm } from "@/features/products/components/product-form";
import { listShops } from "@/features/shops/queries";

export const metadata: Metadata = { title: "New product" };

type Props = PageProps<"/app/[orgSlug]/products/new">;

export default function NewProductPage({ params }: Props) {
  return (
    <Suspense fallback={<ProductFormSkeleton />}>
      <NewProductContent params={params} />
    </Suspense>
  );
}

async function NewProductContent({ params }: Pick<Props, "params">) {
  const { orgSlug } = await params;
  const { organization, role } = await requireMembership(orgSlug);
  if (!can(role, "catalog.manage")) notFound();

  const [tree, shops] = await Promise.all([
    listCategoryTree(organization.id),
    listShops(organization.id),
  ]);

  return (
    <>
      <PageHeader
        title="New product"
        description="Pick a category first: it decides the details, variant options and stock tracking."
      />
      <ProductForm
        organizationSlug={orgSlug}
        categories={toCategoryOptions(tree)}
        shops={shops.map((s) => ({ id: s.id, name: s.name }))}
      />
    </>
  );
}

function ProductFormSkeleton() {
  return (
    <>
      <Skeleton className="h-12 w-72" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-[32rem] rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </>
  );
}
