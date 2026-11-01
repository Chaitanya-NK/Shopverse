import { type Section } from "@/features/design/schema";
import { type StorefrontShop } from "@/features/storefront/schemas";

/** What every section on a storefront page can use. */
export type RenderContext = {
  shop: StorefrontShop;
  /** Wishlisted product ids, and whether a shopper is signed in. */
  saved: Set<string>;
  signedIn: boolean;
  /** The page's URL search params (catalogue, collection sorting). */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  /** The page's own path, for catalogue links and pagination. */
  path: string;
  /** Set on product and collection pages. */
  productSlug?: string;
  collectionSlug?: string;
  /** Position on the page: the first section loads its images eagerly. */
  index: number;
};

export type SectionProps = { section: Section; ctx: RenderContext };
