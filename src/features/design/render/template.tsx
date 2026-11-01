import { notFound } from "next/navigation";

import { getStorefrontDesign } from "@/features/design/queries";
import { SectionList } from "@/features/design/render/sections";
import { type Section } from "@/features/design/schema";
import { type TemplateKey } from "@/features/design/sections";
import { getShopper } from "@/features/shopper/session";
import { getStorefrontShop } from "@/features/storefront/queries";
import { getT } from "@/i18n/server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The shop, its design and the shopper, for rendering a page's sections. */
export async function loadPage(shopSlug: string) {
  const shop = await getStorefrontShop(shopSlug);
  if (!shop) notFound();
  const [{ design, preview }, shopper, t] = await Promise.all([
    getStorefrontDesign(shop),
    getShopper(shop.id),
    getT(shop.language),
  ]);
  return { shop, design, preview, shopper, t };
}

/** A storefront page laid out by one of the design's templates. */
export async function TemplatePage({
  shopSlug,
  template,
  searchParams,
  path,
  productSlug,
  collectionSlug,
  sections,
}: {
  shopSlug: string;
  template: TemplateKey;
  searchParams: SearchParams;
  path: string;
  productSlug?: string;
  collectionSlug?: string;
  /** Overrides the template's sections (custom pages). */
  sections?: (design: Awaited<ReturnType<typeof loadPage>>["design"]) => Section[];
}) {
  const { shop, design, shopper, t } = await loadPage(shopSlug);
  return (
    <SectionList
      sections={sections ? sections(design) : design.templates[template].sections}
      ctx={{
        shop,
        t,
        saved: new Set(shopper?.wishlist),
        signedIn: Boolean(shopper),
        searchParams,
        path,
        productSlug,
        collectionSlug,
      }}
    />
  );
}
