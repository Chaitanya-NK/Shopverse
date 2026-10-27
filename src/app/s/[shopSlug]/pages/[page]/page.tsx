import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import {
  isStorefrontPolicy,
  STOREFRONT_POLICIES,
  toParagraphs,
} from "@/features/storefront/policies";
import { getPolicyText, getStorefrontShop } from "@/features/storefront/queries";

type Props = PageProps<"/s/[shopSlug]/pages/[page]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shopSlug, page } = await params;
  if (!isStorefrontPolicy(page)) return { title: "Not found" };
  return {
    title: STOREFRONT_POLICIES[page],
    alternates: { canonical: routes.storefrontPolicy(shopSlug, page) },
  };
}

export default function PolicyPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-3xl rounded-xl" />}>
      <Policy params={params} />
    </Suspense>
  );
}

async function Policy({ params }: Pick<Props, "params">) {
  const { shopSlug, page } = await params;
  if (!isStorefrontPolicy(page)) notFound();
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
