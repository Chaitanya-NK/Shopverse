import Link from "next/link";

import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

type LogoProps = {
  href?: string;
  className?: string;
  /** Hide the wordmark (e.g. collapsed sidebar). */
  markOnly?: boolean;
};

export function Logo({ href = "/", className, markOnly = false }: LogoProps) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}
    >
      <span
        aria-hidden="true"
        className="flex size-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
      >
        S
      </span>
      {markOnly ? (
        <span className="sr-only">{siteConfig.name}</span>
      ) : (
        <span>{siteConfig.name}</span>
      )}
    </Link>
  );
}
