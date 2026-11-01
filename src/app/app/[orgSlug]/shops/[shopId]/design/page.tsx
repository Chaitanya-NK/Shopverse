import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { DesignEditor } from "@/features/design/components/editor/design-editor";
import { getDesignEditor, presetContext } from "@/features/design/queries";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { getShop } from "@/features/shops/queries";
import { POLICY_PAGES } from "@/features/shops/schemas";

export const metadata: Metadata = { title: "Shop design" };

type Props = PageProps<"/app/[orgSlug]/shops/[shopId]/design">;

export default function ShopDesignPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] rounded-xl" />}>
      <ShopDesign params={params} />
    </Suspense>
  );
}

async function ShopDesign({ params }: Pick<Props, "params">) {
  const { orgSlug, shopId } = await params;
  if (!z.uuid().safeParse(shopId).success) notFound();
  const { organization, role } = await requireMembership(orgSlug);
  const summary = await getShop(organization.id, shopId);
  if (!summary) notFound();
  if (!can(role, "storefront.design"))
    return (
      <p className="text-sm text-muted-foreground">
        Only owners, admins and shop managers can change the shop&apos;s design.
      </p>
    );

  const shop = {
    id: summary.id,
    name: summary.name,
    tagline: summary.settings.tagline || null,
    currency: summary.currency,
    shippingFee: summary.settings.shippingFee ?? 0,
    freeShippingOver: summary.settings.freeShippingOver ?? null,
    branding: summary.branding,
  };
  const data = await getDesignEditor(organization.id, shop);
  const policies = Object.values(POLICY_PAGES)
    .filter((p) => summary.settings.policies[p.slug].trim() !== "")
    .map((p) => ({ handle: p.slug, title: p.title }));

  return (
    <DesignEditor
      organizationSlug={orgSlug}
      shop={{
        id: summary.id,
        name: summary.name,
        slug: summary.slug,
        live: summary.status === "live",
      }}
      initial={{
        design: data.design,
        version: data.version,
        hasDraft: data.hasDraft,
        publishedAt: data.publishedAt,
      }}
      lookups={{
        collections: data.collections,
        categories: data.categories,
        products: data.products,
        policies,
      }}
      presetContext={presetContext(shop, {
        collections: data.collections,
        categories: data.categories,
      })}
      backHref={routes.orgShop(orgSlug, summary.id)}
      brandHref={routes.orgShopBrand(orgSlug, summary.id)}
    />
  );
}
