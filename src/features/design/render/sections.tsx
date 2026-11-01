import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  CatalogueSection,
  FeaturedCollectionSection,
  HeroSection,
  ProductGridSection,
  ShopBySection,
  SlideshowSection,
} from "@/features/design/render/catalogue";
import {
  BrandStorySection,
  CountdownSection,
  FaqSection,
  GallerySection,
  ImageWithTextSection,
  LocationsSection,
  NewsletterSection,
  PromisesSection,
  ReviewsSection,
  RichTextSection,
  SocialGridSection,
  VideoSection,
} from "@/features/design/render/content";
import { type RenderContext, type SectionProps } from "@/features/design/render/context";
import {
  CartMainSection,
  CollectionMainSection,
  ProductMainSection,
  ProductReviewsSection,
  RelatedProductsSection,
} from "@/features/design/render/pages";
import { type Section } from "@/features/design/schema";
import { type SectionType } from "@/features/design/sections";

const RENDERERS: Record<
  SectionType,
  (props: SectionProps) => React.ReactNode | Promise<React.ReactNode>
> = {
  slideshow: SlideshowSection,
  hero: HeroSection,
  "featured-collection": FeaturedCollectionSection,
  "product-grid": ProductGridSection,
  "shop-by": ShopBySection,
  catalogue: CatalogueSection,
  "image-with-text": ImageWithTextSection,
  "rich-text": RichTextSection,
  video: VideoSection,
  gallery: GallerySection,
  faq: FaqSection,
  reviews: ReviewsSection,
  promises: PromisesSection,
  countdown: CountdownSection,
  newsletter: NewsletterSection,
  "brand-story": BrandStorySection,
  locations: LocationsSection,
  "social-grid": SocialGridSection,
  "product-main": ProductMainSection,
  "product-reviews": ProductReviewsSection,
  "related-products": RelatedProductsSection,
  "collection-main": CollectionMainSection,
  "cart-main": CartMainSection,
};

/** Sections that fetch data stream in behind a placeholder of about their size. */
const FALLBACK: Partial<Record<SectionType, string>> = {
  "featured-collection": "h-80",
  "product-grid": "h-80",
  "shop-by": "h-24",
  catalogue: "h-[40rem]",
  reviews: "h-56",
  "product-main": "h-[32rem]",
  "product-reviews": "h-48",
  "related-products": "h-72",
  "collection-main": "h-[40rem]",
  "cart-main": "h-96",
};

/** A page's sections, top to bottom. Hidden sections are left out. */
export function SectionList({
  sections,
  ctx,
}: {
  sections: Section[];
  ctx: Omit<RenderContext, "index">;
}) {
  const visible = sections.filter((s) => !s.hidden);
  return (
    <div className="space-y-10 sm:space-y-14">
      {visible.map((section, index) => {
        const Render = RENDERERS[section.type];
        const height = FALLBACK[section.type];
        const node = <Render section={section} ctx={{ ...ctx, index }} />;
        return height ? (
          <Suspense
            key={section.id}
            fallback={<Skeleton className={`${height} w-full rounded-2xl`} />}
          >
            {node}
          </Suspense>
        ) : (
          <Suspense key={section.id}>{node}</Suspense>
        );
      })}
    </div>
  );
}
