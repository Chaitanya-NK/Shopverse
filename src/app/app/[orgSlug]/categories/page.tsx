import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { AddIndustriesDialog } from "@/features/catalog/components/add-industries-dialog";
import { CategoryTree } from "@/features/catalog/components/category-tree";
import { listCategoryTree } from "@/features/catalog/queries";
import { INDUSTRY_IDS } from "@/features/organizations/industries";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";

export const metadata: Metadata = { title: "Categories" };

type Props = PageProps<"/app/[orgSlug]/categories">;

export default function CategoriesPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <>
          <Skeleton className="h-12 w-80" />
          <Skeleton className="h-80 rounded-xl" />
        </>
      }
    >
      <CategoriesContent params={params} />
    </Suspense>
  );
}

async function CategoriesContent({ params }: Pick<Props, "params">) {
  const { orgSlug } = await params;
  const { organization, role } = await requireMembership(orgSlug);
  const tree = await listCategoryTree(organization.id);
  const available = INDUSTRY_IDS.filter((id) => !organization.industries.includes(id));

  return (
    <>
      <PageHeader
        title="Categories"
        description="Each category defines the product details you capture, which of them create variants, and how stock is tracked."
        actions={
          can(role, "organization.update") && (
            <AddIndustriesDialog organizationSlug={orgSlug} available={available} />
          )
        }
      />
      <CategoryTree roots={tree} />
    </>
  );
}
