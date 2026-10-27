import Image from "next/image";

import { type ProductImage, productImageUrl } from "@/features/products/images";
import { ProductArt } from "@/features/storefront/components/product-art";
import { cn } from "@/lib/utils";

/** A product's cover photo, or generated artwork when it has none. */
export function ProductVisual({
  image,
  alt,
  seed,
  industry,
  size = "thumb",
  sizes = "(min-width: 1024px) 25vw, 50vw",
  priority,
  className,
}: {
  image: ProductImage | null;
  alt: string;
  seed: string;
  industry: string | null;
  size?: "thumb" | "large";
  sizes?: string;
  priority?: boolean;
  className?: string;
}) {
  if (!image)
    return (
      <ProductArt
        seed={seed}
        industry={industry}
        size={size === "large" ? "lg" : "md"}
        className={className}
      />
    );
  return (
    <div className={cn("relative aspect-square overflow-hidden rounded-xl bg-muted", className)}>
      {/* Already resized to WebP on upload, so no runtime optimisation needed. */}
      <Image
        src={productImageUrl(image.path, size)}
        alt={image.alt || alt}
        fill
        unoptimized
        sizes={sizes}
        priority={priority}
        className="object-cover"
      />
    </div>
  );
}
