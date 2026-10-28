import { LayersIcon, PlusIcon, StarIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { routes } from "@/config/routes";
import { CollectionDialog } from "@/features/collections/components/collection-dialog";
import { listCollections } from "@/features/collections/queries";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { listShops } from "@/features/shops/queries";

export const metadata: Metadata = { title: "Collections" };

type Props = PageProps<"/app/[orgSlug]/collections">;

export default function CollectionsPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <Collections params={params} />
    </Suspense>
  );
}

async function Collections({ params }: Pick<Props, "params">) {
  const { orgSlug } = await params;
  const { organization, role } = await requireMembership(orgSlug);
  const [collections, shops] = await Promise.all([
    listCollections(organization.id),
    listShops(organization.id),
  ]);
  const canManage = can(role, "catalog.manage");
  const shopById = new Map(shops.map((s) => [s.id, s]));
  const newButton = canManage && shops.length > 0 && (
    <CollectionDialog
      organizationSlug={orgSlug}
      shops={shops.map((s) => ({ id: s.id, name: s.name, slug: s.slug }))}
      trigger={
        <Button>
          <PlusIcon />
          New collection
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Collections"
        description="Hand-picked groups of products, each with its own page in the shop."
        actions={collections.length > 0 ? newButton : undefined}
      />
      {collections.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LayersIcon />
            </EmptyMedia>
            <EmptyTitle>No collections yet</EmptyTitle>
            <EmptyDescription>
              {shops.length === 0
                ? "Create a shop first, then group its products into collections."
                : "Group products for a season, a festival or a theme, and feature them on your homepage."}
            </EmptyDescription>
          </EmptyHeader>
          {newButton && <EmptyContent>{newButton}</EmptyContent>}
        </Empty>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Collection</TableHead>
                <TableHead>Shop</TableHead>
                <TableHead className="text-right">Products</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {collections.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      href={routes.orgCollection(orgSlug, c.id)}
                      className="font-medium hover:underline"
                    >
                      {c.title}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">/{c.slug}</div>
                  </TableCell>
                  <TableCell>{shopById.get(c.shopId)?.name ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.productCount}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {c.isActive ? (
                        <Badge variant="secondary">Visible</Badge>
                      ) : (
                        <Badge variant="outline">Hidden</Badge>
                      )}
                      {c.featured && (
                        <Badge variant="outline">
                          <StarIcon />
                          Homepage
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
