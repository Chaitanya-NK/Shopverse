import { StarIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Read-only stars (rounded to the nearest half), with an accessible label. */
export function StarRating({
  value,
  size = "sm",
  className,
}: {
  value: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const rounded = Math.round(value * 2) / 2;
  const iconSize = size === "lg" ? "size-5" : size === "md" ? "size-4" : "size-3.5";
  return (
    <span
      role="img"
      aria-label={`${value.toLocaleString("en-IN", { maximumFractionDigits: 1 })} out of 5 stars`}
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = rounded >= n ? 1 : rounded >= n - 0.5 ? 0.5 : 0;
        return (
          <span key={n} className={cn("relative inline-block", iconSize)} aria-hidden>
            <StarIcon className={cn("absolute inset-0 text-muted-foreground/40", iconSize)} />
            {fill > 0 && (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                <StarIcon className={cn("fill-amber-400 text-amber-400", iconSize)} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
