"use client";

/* eslint-disable @next/next/no-img-element -- responsive srcSet of public storage images */
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

export type Slide = {
  id: string;
  src: string;
  srcSet: string;
  width: number;
  height: number;
  headline: string;
  subtext: string;
  buttonLabel: string;
  /** Resolved link (in the shop or https), or null. */
  href: string | null;
  external: boolean;
  alt: string;
};

const HEIGHTS = {
  small: "aspect-[5/2] sm:aspect-[4/1]",
  medium: "aspect-[2/1] sm:aspect-[3/1]",
  large: "aspect-[4/5] sm:aspect-[16/7]",
} as const;

/**
 * Wide images with a headline: swipe or use the arrows. No autoplay, so
 * nothing moves unless the shopper asks it to.
 */
export function Slideshow({
  slides: banners,
  label,
  height = "medium",
}: {
  slides: Slide[];
  label: string;
  height?: keyof typeof HEIGHTS;
}) {
  const t = useT();
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
      aria-label={label}
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
                src={b.src}
                srcSet={b.srcSet}
                sizes="(min-width: 1280px) 1280px, 100vw"
                alt={b.alt}
                width={b.width}
                height={b.height}
                fetchPriority={i === 0 ? "high" : "low"}
                loading={i === 0 ? "eager" : "lazy"}
                className={cn("w-full object-cover", HEIGHTS[height] ?? HEIGHTS.medium)}
              />
              {(b.headline || b.subtext || (b.buttonLabel && b.href)) && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-5 text-white sm:p-8">
                  {b.headline && (
                    <p className="sv-heading max-w-xl text-2xl font-semibold tracking-tight sm:text-4xl">
                      {b.headline}
                    </p>
                  )}
                  {b.subtext && <p className="mt-1 max-w-xl sm:text-lg">{b.subtext}</p>}
                  {b.buttonLabel && b.href && (
                    <span className="mt-4 inline-flex h-10 items-center rounded-md bg-white px-5 text-sm font-medium text-black">
                      {b.buttonLabel}
                    </span>
                  )}
                </div>
              )}
            </>
          );
          return (
            <div
              key={b.id}
              role="group"
              aria-roledescription="slide"
              aria-label={t("{n} of {total}", { n: i + 1, total: banners.length })}
              className="relative w-full shrink-0 snap-start"
            >
              {b.href && b.external ? (
                <a
                  href={b.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                  aria-label={b.headline || b.alt || t("Slide {n}", { n: i + 1 })}
                >
                  {image}
                </a>
              ) : b.href ? (
                <Link
                  href={b.href}
                  className="block"
                  aria-label={b.headline || b.alt || t("Slide {n}", { n: i + 1 })}
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
            aria-label={t("Previous slide")}
            disabled={index === 0}
            onClick={() => go(index - 1)}
            className="absolute top-1/2 left-3 hidden -translate-y-1/2 rounded-full opacity-90 sm:inline-flex"
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            aria-label={t("Next slide")}
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
                aria-label={t("Show slide {n}", { n: i + 1 })}
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
