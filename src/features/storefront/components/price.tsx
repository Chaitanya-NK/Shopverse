"use client";

import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

type PriceProps = {
  price: number;
  maxPrice?: number;
  compareAt?: number | null;
  currency: string;
  size?: "sm" | "lg";
};

/** "₹499  ₹699  29% off", or a range for products with several prices. */
export function Price({ price, maxPrice, compareAt, currency, size = "sm" }: PriceProps) {
  const t = useT();
  const range = maxPrice !== undefined && maxPrice > price;
  const off =
    compareAt && compareAt > price ? Math.round(((compareAt - price) / compareAt) * 100) : null;
  return (
    <p
      className={cn(
        "flex flex-wrap items-baseline gap-x-2",
        size === "lg" ? "text-2xl" : "text-sm",
      )}
    >
      <span className="font-semibold tabular-nums">
        {range
          ? t("From {amount}", { amount: formatMoney(price, currency) })
          : formatMoney(price, currency)}
      </span>
      {off !== null && (
        <>
          <span
            className={cn(
              "text-muted-foreground tabular-nums line-through",
              size === "lg" ? "text-base" : "text-xs",
            )}
          >
            {formatMoney(compareAt!, currency)}
          </span>
          <span
            className={cn(
              "font-medium text-emerald-700 dark:text-emerald-400",
              size === "lg" ? "text-base" : "text-xs",
            )}
          >
            {t("{percent}% off", { percent: off })}
          </span>
        </>
      )}
    </p>
  );
}
