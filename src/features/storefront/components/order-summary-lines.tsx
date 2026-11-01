"use client";

import { type Quote } from "@/features/storefront/schemas";
import { formatMoney } from "@/lib/format";
import { useT } from "@/i18n/client";

/** Subtotal, discount, delivery and total for the cart and checkout summaries. */
export function OrderSummaryLines({ quote, currency }: { quote: Quote; currency: string }) {
  const t = useT();
  const money = (n: number) => formatMoney(n, currency);
  const label = quote.discount
    ? quote.discount.code
      ? t("Discount ({code})", { code: quote.discount.code })
      : quote.discount.title
    : null;
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between">
        <dt className="text-muted-foreground">{t("Subtotal")}</dt>
        <dd className="tabular-nums">{money(quote.subtotal)}</dd>
      </div>
      {label && quote.discountTotal > 0 && (
        <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
          <dt>{label}</dt>
          <dd className="tabular-nums">−{money(quote.discountTotal)}</dd>
        </div>
      )}
      <div className="flex justify-between">
        <dt className="text-muted-foreground">{t("Delivery")}</dt>
        <dd className="tabular-nums">
          {quote.shipping === 0
            ? quote.discount?.kind === "free_shipping"
              ? t("Free ({code})", { code: quote.discount.code ?? quote.discount.title })
              : t("Free")
            : money(quote.shipping)}
        </dd>
      </div>
      <div className="flex justify-between border-t pt-2 text-base font-semibold">
        <dt>{t("Total")}</dt>
        <dd className="tabular-nums">{money(quote.total)}</dd>
      </div>
      {quote.saved > 0 && (
        <p className="text-right text-xs text-emerald-700 dark:text-emerald-400">
          {t("You save {amount}", { amount: money(quote.saved) })}
        </p>
      )}
    </dl>
  );
}
