import { ArrowLeftIcon, BoxesIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { routes } from "@/config/routes";
import { TrackingBadge } from "@/features/catalog/components/tracking-badge";
import { listCategoryTree } from "@/features/catalog/queries";
import { toCategoryOptions } from "@/features/catalog/tree";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { ProductPhotos } from "@/features/products/components/product-photos";
import { ProductForm } from "@/features/products/components/product-form";
import { ProductStatusBadge } from "@/features/products/components/product-status-badge";
import { ProductStockTable } from "@/features/products/components/product-stock-table";
import { getProduct, getProductStock, listProductImages } from "@/features/products/queries";
import { listShops } from "@/features/shops/queries";

export const metadata: Metadata = { title: "Product" };

type Props = PageProps<"/app/[orgSlug]/products/[productId]">;

export default function ProductPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <>
          <Skeleton className="h-12 w-96" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-[32rem] rounded-xl" />
        </>
      }
    >
      <ProductContent params={params} />
    </Suspense>
  );
}

async function ProductContent({ params }: Pick<Props, "params">) {
  const { orgSlug, productId } = await params;
  if (!z.uuid().safeParse(productId).success) notFound();

  const { organization, role } = await requireMembership(orgSlug);
  const product = await getProduct(organization.id, productId);
  if (!product) notFound();

  const [tree, shops, stock, photos] = await Promise.all([
    listCategoryTree(organization.id),
    listShops(organization.id),
    getProductStock(product.id),
    listProductImages(product.id),
  ]);
  const canManage = can(role, "catalog.manage");
  const stockedVariantIds = [...new Set(stock.filter((s) => s.onHand > 0).map((s) => s.variantId))];

  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href={routes.orgProducts(orgSlug)}>
            <ArrowLeftIcon />
            Products
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{product.title}</h1>
          <ProductStatusBadge status={product.status} />
          <TrackingBadge tracking={product.tracking} />
        </div>
      </div>

      <Tabs defaultValue="product">
        <TabsList>
          <TabsTrigger value="product">Product</TabsTrigger>
          <TabsTrigger value="photos">
            Photos
            {photos.length > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums">{photos.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
        </TabsList>
        <TabsContent value="product" className="pt-4">
          {canManage ? (
            <ProductForm
              // Remount with fresh server data after each save (new variant ids etc.).
              key={product.updatedAt}
              organizationSlug={orgSlug}
              categories={toCategoryOptions(tree)}
              shops={shops.map((s) => ({ id: s.id, name: s.name }))}
              product={product}
              stockedVariantIds={stockedVariantIds}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              You can view this product. Ask a manager to make changes.
            </p>
          )}
        </TabsContent>
        <TabsContent value="photos" className="pt-4">
          {canManage ? (
            <ProductPhotos
              organizationSlug={orgSlug}
              productId={product.id}
              productTitle={product.title}
              photos={photos}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {photos.length} photo{photos.length === 1 ? "" : "s"}. Ask a manager to change them.
            </p>
          )}
        </TabsContent>
        <TabsContent value="stock" className="space-y-4 pt-4">
          {stock.length > 0 ? (
            <ProductStockTable rows={stock} showExpiry={product.tracking === "batch"} />
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BoxesIcon />
                </EmptyMedia>
                <EmptyTitle>No stock yet</EmptyTitle>
                <EmptyDescription>
                  Receive stock into a warehouse from the Inventory page.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          <Button asChild variant="outline">
            <Link href={routes.orgInventory(orgSlug)}>Open inventory</Link>
          </Button>
        </TabsContent>
      </Tabs>
    </>
  );
}
