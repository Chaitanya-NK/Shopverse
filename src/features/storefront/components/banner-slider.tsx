"use client";

/* eslint-disable @next/next/no-img-element -- responsive srcSet of public storage images */
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { type Banner, BRAND_SIZES, brandImageUrl } from "@/features/branding/schemas";
import { cn } from "@/lib/utils";

/**
 * The shop's homepage banners: swipe or use the arrows. No autoplay, so
 * nothing moves unless the shopper asks it to.
 */
export function BannerSlider({ banners, shopName }: { banners: Banner[]; shopName: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const go = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section
      aria-roledescription="carousel"
      aria-label={`${shopName} highlights`}
      className="relative overflow-hidden rounded-3xl bg-muted"
    >
      <div
        ref={track}
        className="flex snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto [&::-webkit-scrollbar]:hidden"
      >
        {banners.map((b, i) => {
          const image = (
            <>
              <img
                src={brandImageUrl(b.path, "banner", "large")}
                srcSet={`${brandImageUrl(b.path, "banner", "small")} ${BRAND_SIZES.banner.small}w, ${brandImageUrl(b.path, "banner", "large")} ${BRAND_SIZES.banner.large}w`}
                sizes="(min-width: 1152px) 1152px, 100vw"
                alt={b.alt}
                width={b.width}
                height={b.height}
                fetchPriority={i === 0 ? "high" : "low"}
                loading={i === 0 ? "eager" : "lazy"}
                className="aspect-[2/1] w-full object-cover sm:aspect-[3/1]"
              />
              {(b.headline || b.subtext) && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-5 text-white sm:p-8">
                  {b.headline && (
                    <p className="max-w-xl text-2xl font-semibold tracking-tight sm:text-4xl">
                      {b.headline}
                    </p>
                  )}
                  {b.subtext && <p className="mt-1 max-w-xl sm:text-lg">{b.subtext}</p>}
                </div>
              )}
            </>
          );
          return (
            <div
              key={b.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${banners.length}`}
              className="relative w-full shrink-0 snap-start"
            >
              {b.link ? (
                <Link
                  href={b.link}
                  className="block"
                  aria-label={b.headline || b.alt || `Banner ${i + 1}`}
                >
                  {image}
                </Link>
              ) : (
                image
              )}
            </div>
          );
        })}
      </div>
      {banners.length > 1 && (
        <>
          <Button
            size="icon"
            variant="secondary"
            aria-label="Previous banner"
            disabled={index === 0}
            onClick={() => go(index - 1)}
            className="absolute top-1/2 left-3 hidden -translate-y-1/2 rounded-full opacity-90 sm:inline-flex"
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            aria-label="Next banner"
            disabled={index === banners.length - 1}
            onClick={() => go(index + 1)}
            className="absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-full opacity-90 sm:inline-flex"
          >
            <ChevronRightIcon />
          </Button>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-label={`Show banner ${i + 1}`}
                aria-current={i === index}
                onClick={() => go(i)}
                className={cn(
                  "h-2 rounded-full bg-white/60 transition-all outline-none focus-visible:ring-2 focus-visible:ring-white",
                  i === index ? "w-6 bg-white" : "w-2",
                )}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
