import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { ProductImport } from "@/features/products/components/product-import";

export const metadata: Metadata = { title: "Import products" };

type Props = PageProps<"/app/[orgSlug]/products/import">;

export default function ImportProductsPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <ImportProducts params={params} />
    </Suspense>
  );
}

async function ImportProducts({ params }: Pick<Props, "params">) {
  const { orgSlug } = await params;
  const { role } = await requireMembership(orgSlug);
  if (!can(role, "catalog.manage")) notFound();
  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href={routes.orgProducts(orgSlug)}>
            <ArrowLeftIcon />
            Products
          </Link>
        </Button>
        <PageHeader
          title="Import products"
          description="Add or update many products at once from a spreadsheet. Stock is added separately, from Inventory."
        />
      </div>
      <ProductImport organizationSlug={orgSlug} />
    </>
  );
}
