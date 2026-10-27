import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type PriceProps = {
  price: number;
  maxPrice?: number;
  compareAt?: number | null;
  currency: string;
  size?: "sm" | "lg";
};

/** "₹499  ₹699  29% off", or a range for products with several prices. */
export function Price({ price, maxPrice, compareAt, currency, size = "sm" }: PriceProps) {
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
        {range ? `From ${formatMoney(price, currency)}` : formatMoney(price, currency)}
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
            {off}% off
          </span>
        </>
      )}
    </p>
  );
}
