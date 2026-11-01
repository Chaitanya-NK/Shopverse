/* eslint-disable @next/next/no-img-element -- pre-sized WebP from public storage, any aspect ratio */
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { BRAND_SIZES, brandImageUrl } from "@/features/branding/schemas";
import { type DesignImage } from "@/features/design/fields";
import { isExternal, shopHref } from "@/features/design/links";
import { cn } from "@/lib/utils";

export function designImageSrc(image: DesignImage) {
  const small = brandImageUrl(image.path, "banner", "small");
  const large = brandImageUrl(image.path, "banner", "large");
  return {
    src: large,
    srcSet: `${small} ${BRAND_SIZES.banner.small}w, ${large} ${BRAND_SIZES.banner.large}w`,
  };
}

/** An uploaded section image. */
export function DesignImg({
  image,
  alt,
  sizes = "(min-width: 1024px) 50vw, 100vw",
  className,
  priority,
}: {
  image: DesignImage;
  alt: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <img
      {...designImageSrc(image)}
      sizes={sizes}
      alt={alt}
      width={image.width}
      height={image.height}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={cn("object-cover", className)}
    />
  );
}

export type Background = "none" | "muted" | "brand";

/** Every section sits in one of these: an anchor for the editor, spacing and a background. */
export function SectionFrame({
  id,
  label,
  background = "none",
  className,
  children,
}: {
  id: string;
  label?: string;
  background?: Background | string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-section-id={id}
      aria-label={label || undefined}
      className={cn(
        "scroll-mt-24",
        background === "muted" && "rounded-3xl bg-muted/60 px-5 py-10 sm:px-10",
        background === "brand" &&
          "rounded-3xl bg-primary px-5 py-10 text-primary-foreground sm:px-10",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SectionHeading({
  title,
  subtitle,
  action,
  align = "left",
}: {
  title?: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  align?: "left" | "center";
}) {
  if (!title && !subtitle && !action) return null;
  return (
    <div
      className={cn(
        "mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-1",
        align === "center" && "flex-col items-center text-center",
      )}
    >
      <div className="min-w-0 space-y-1">
        {title && <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>}
        {subtitle && <div className="text-sm opacity-75">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

/** A link from a design: inside the shop, or an https page in a new tab. */
export function DesignLink({
  shopSlug,
  link,
  className,
  children,
  ...rest
}: {
  shopSlug: string;
  link: string;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentProps<"a">, "href">) {
  const href = shopHref(shopSlug, link);
  if (!href) return <span className={className}>{children}</span>;
  return isExternal(href) ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} {...rest}>
      {children}
    </a>
  ) : (
    <Link href={href} className={className} {...rest}>
      {children}
    </Link>
  );
}

export function DesignButton({
  shopSlug,
  label,
  link,
  variant = "default",
  size = "lg",
  className,
}: {
  shopSlug: string;
  label: unknown;
  link: unknown;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const text = typeof label === "string" ? label.trim() : "";
  const href = typeof link === "string" ? shopHref(shopSlug, link) : null;
  if (!text || !href) return null;
  return (
    <Button asChild variant={variant} size={size} className={className}>
      <DesignLink shopSlug={shopSlug} link={link as string}>
        {text}
      </DesignLink>
    </Button>
  );
}

/** Text with blank lines between paragraphs. */
export function Paragraphs({ text, className }: { text: unknown; className?: string }) {
  if (typeof text !== "string" || !text.trim()) return null;
  return (
    <div className={cn("space-y-3 leading-relaxed", className)}>
      {text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p}
          </p>
        ))}
    </div>
  );
}

/** The product grid every product section uses (columns come from the shop's style). */
export function ProductGridLayout({
  layout = "grid",
  children,
}: {
  layout?: "grid" | "row" | string;
  children: React.ReactNode;
}) {
  return layout === "row" ? (
    <div className="-mx-4 flex snap-x snap-mandatory [scrollbar-width:thin] gap-4 overflow-x-auto px-4 pb-2 *:w-[44%] *:shrink-0 *:snap-start sm:*:w-[30%] lg:*:w-[calc((100%-3*1rem)/4)]">
      {children}
    </div>
  ) : (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-(--sv-cols)">
      {children}
    </div>
  );
}

export function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}
export function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
export function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}
export function image(value: unknown): DesignImage | null {
  return value && typeof value === "object" && "path" in value ? (value as DesignImage) : null;
}
