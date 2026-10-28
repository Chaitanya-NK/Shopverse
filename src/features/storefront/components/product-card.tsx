import Link from "next/link";

import { routes } from "@/config/routes";
import { StarRating } from "@/features/reviews/components/star-rating";
import { Price } from "@/features/storefront/components/price";
import { ProductVisual } from "@/features/storefront/components/product-visual";
import { type CatalogItem } from "@/features/storefront/schemas";
import { cn } from "@/lib/utils";

export function ProductCard({
  shopSlug,
  product,
  currency,
  action,
}: {
  shopSlug: string;
  product: CatalogItem;
  currency: string;
  /** Rendered over the image, outside the link (e.g. a wishlist button). */
  action?: React.ReactNode;
}) {
  return (
    <div className="relative">
      {action}
      <Link
        href={routes.storefrontProduct(shopSlug, product.slug)}
        className="group flex flex-col gap-3 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative">
          <ProductVisual
            image={product.image}
            alt={product.title}
            seed={product.id}
            industry={product.industry}
            className={cn(
              "transition-transform duration-300 group-hover:scale-[1.02]",
              !product.inStock && "opacity-60",
            )}
          />
          {!product.inStock && (
            <span className="absolute top-3 left-3 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium">
              Sold out
            </span>
          )}
        </div>
        <div className="space-y-1 px-0.5">
          {product.category && <p className="text-xs text-muted-foreground">{product.category}</p>}
          <h3 className="line-clamp-2 font-medium group-hover:underline">{product.title}</h3>
          {product.rating && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <StarRating value={product.rating.average} />
              <span className="tabular-nums">({product.rating.count})</span>
            </p>
          )}
          <Price
            price={product.minPrice}
            maxPrice={product.maxPrice}
            compareAt={product.compareAt}
            currency={currency}
          />
        </div>
      </Link>
    </div>
  );
}
