"use client";

import Image from "next/image";
import { useState } from "react";

import { type ProductImage, productImageUrl } from "@/features/products/images";
import { ProductArt } from "@/features/storefront/components/product-art";
import { cn } from "@/lib/utils";

/** Large photo with a row of thumbnails to switch between them. */
export function ProductGallery({
  images,
  title,
  seed,
  industry,
}: {
  images: ProductImage[];
  title: string;
  seed: string;
  industry: string | null;
}) {
  const [selected, setSelected] = useState(0);
  if (images.length === 0)
    return <ProductArt seed={seed} industry={industry} size="lg" className="rounded-3xl" />;

  const current = images[Math.min(selected, images.length - 1)]!;
  return (
    <div className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-3xl bg-muted">
        <Image
          src={productImageUrl(current.path, "large")}
          alt={current.alt || title}
          fill
          unoptimized
          priority
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-cover"
        />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Product photos">
          {images.map((image, i) => (
            <button
              key={image.path}
              type="button"
              onClick={() => setSelected(i)}
              aria-label={`Show photo ${i + 1} of ${images.length}`}
              aria-pressed={i === selected}
              className={cn(
                "relative size-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors sm:size-20",
                i === selected
                  ? "border-primary"
                  : "border-transparent opacity-80 hover:opacity-100",
              )}
            >
              <Image
                src={productImageUrl(image.path, "thumb")}
                alt=""
                fill
                unoptimized
                sizes="80px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
