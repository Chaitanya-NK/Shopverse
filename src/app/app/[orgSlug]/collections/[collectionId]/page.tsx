import { ArrowLeftIcon, ExternalLinkIcon, PencilIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { CollectionDialog } from "@/features/collections/components/collection-dialog";
import { CollectionProducts } from "@/features/collections/components/collection-products";
import { DeleteCollectionButton } from "@/features/collections/components/delete-collection-button";
import { getCollection } from "@/features/collections/queries";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { listShops } from "@/features/shops/queries";

export const metadata: Metadata = { title: "Collection" };

type Props = PageProps<"/app/[orgSlug]/collections/[collectionId]">;

export default function CollectionPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <CollectionView params={params} />
    </Suspense>
  );
}

async function CollectionView({ params }: Pick<Props, "params">) {
  const { orgSlug, collectionId } = await params;
  if (!z.uuid().safeParse(collectionId).success) notFound();
  const { organization, role } = await requireMembership(orgSlug);
  const [collection, shops] = await Promise.all([
    getCollection(organization.id, collectionId),
    listShops(organization.id),
  ]);
  if (!collection) notFound();
  const canManage = can(role, "catalog.manage");

  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href={routes.orgCollections(orgSlug)}>
            <ArrowLeftIcon />
            Collections
          </Link>
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{collection.title}</h1>
              {collection.isActive ? (
                <Badge variant="secondary">Visible</Badge>
              ) : (
                <Badge variant="outline">Hidden</Badge>
              )}
              {collection.featured && <Badge variant="outline">On the homepage</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {collection.shopName}
              {collection.description ? ` · ${collection.description}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {collection.isActive && (
              <Button asChild variant="outline">
                <Link
                  href={routes.storefrontCollection(collection.shopSlug, collection.slug)}
                  target="_blank"
                >
                  <ExternalLinkIcon />
                  View in shop
                </Link>
              </Button>
            )}
            {canManage && (
              <>
                <CollectionDialog
                  organizationSlug={orgSlug}
                  shops={shops.map((s) => ({ id: s.id, name: s.name, slug: s.slug }))}
                  collection={collection}
                  trigger={
                    <Button variant="outline">
                      <PencilIcon />
                      Edit
                    </Button>
                  }
                />
                <DeleteCollectionButton
                  organizationSlug={orgSlug}
                  collectionId={collection.id}
                  title={collection.title}
                />
              </>
            )}
          </div>
        </div>
      </div>
      {canManage ? (
        <CollectionProducts
          organizationSlug={orgSlug}
          collectionId={collection.id}
          products={collection.products}
        />
      ) : (
        <ol className="divide-y rounded-xl border">
          {collection.products.map((p, i) => (
            <li key={p.id} className="flex gap-3 p-3 text-sm">
              <span className="w-6 text-right text-muted-foreground">{i + 1}</span>
              {p.title}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
