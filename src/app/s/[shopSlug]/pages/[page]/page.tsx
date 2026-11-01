import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { getStorefrontDesign } from "@/features/design/queries";
import { loadPage } from "@/features/design/render/template";
import { SectionList } from "@/features/design/render/sections";
import {
  isStorefrontPolicy,
  STOREFRONT_POLICIES,
  toParagraphs,
} from "@/features/storefront/policies";
import { getPolicyText, getStorefrontShop } from "@/features/storefront/queries";

type Props = PageProps<"/s/[shopSlug]/pages/[page]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shopSlug, page } = await params;
  if (isStorefrontPolicy(page))
    return {
      title: STOREFRONT_POLICIES[page],
      alternates: { canonical: routes.storefrontPolicy(shopSlug, page) },
    };
  const shop = await getStorefrontShop(shopSlug);
  if (!shop) return { title: "Not found" };
  const { design } = await getStorefrontDesign(shop);
  const custom = design.pages.find((p) => p.handle === page);
  if (!custom) return { title: "Not found" };
  return {
    title: custom.title,
    description: custom.description || undefined,
    alternates: { canonical: routes.storefrontCustomPage(shopSlug, custom.handle) },
  };
}

/** The shop's policy pages, and pages the shop builds in its design. */
export default function ShopPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-3xl rounded-xl" />}>
      <Page params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Page({ params, searchParams }: Props) {
  const { shopSlug, page } = await params;
  if (isStorefrontPolicy(page)) return <Policy shopSlug={shopSlug} page={page} />;

  const { shop, design, shopper } = await loadPage(shopSlug);
  const custom = design.pages.find((p) => p.handle === page);
  if (!custom) notFound();
  return (
    <div className="space-y-10">
      {custom.showTitle && (
        <h1 className="text-center text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {custom.title}
        </h1>
      )}
      <SectionList
        sections={custom.sections}
        ctx={{
          shop,
          saved: new Set(shopper?.wishlist),
          signedIn: Boolean(shopper),
          searchParams,
          path: routes.storefrontCustomPage(shop.slug, custom.handle),
        }}
      />
    </div>
  );
}

async function Policy({
  shopSlug,
  page,
}: {
  shopSlug: string;
  page: keyof typeof STOREFRONT_POLICIES;
}) {
  const [shop, text] = await Promise.all([
    getStorefrontShop(shopSlug),
    getPolicyText(shopSlug, page),
  ]);
  if (!shop || !text) notFound();

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">{shop.name}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{STOREFRONT_POLICIES[page]}</h1>
      </header>
      <div className="space-y-4 leading-relaxed text-muted-foreground">
        {toParagraphs(text).map((paragraph, i) => (
          <p key={i} className="whitespace-pre-line">
            {paragraph}
          </p>
        ))}
      </div>
    </article>
  );
}
