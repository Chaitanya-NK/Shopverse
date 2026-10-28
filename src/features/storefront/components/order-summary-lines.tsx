import { type Quote } from "@/features/storefront/schemas";
import { formatMoney } from "@/lib/format";

/** Subtotal, discount, delivery and total for the cart and checkout summaries. */
export function OrderSummaryLines({ quote, currency }: { quote: Quote; currency: string }) {
  const money = (n: number) => formatMoney(n, currency);
  const label = quote.discount
    ? quote.discount.code
      ? `Discount (${quote.discount.code})`
      : quote.discount.title
    : null;
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd className="tabular-nums">{money(quote.subtotal)}</dd>
      </div>
      {label && quote.discountTotal > 0 && (
        <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
          <dt>{label}</dt>
          <dd className="tabular-nums">−{money(quote.discountTotal)}</dd>
        </div>
      )}
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Delivery</dt>
        <dd className="tabular-nums">
          {quote.shipping === 0
            ? quote.discount?.kind === "free_shipping"
              ? `Free (${quote.discount.code ?? quote.discount.title})`
              : "Free"
            : money(quote.shipping)}
        </dd>
      </div>
      <div className="flex justify-between border-t pt-2 text-base font-semibold">
        <dt>Total</dt>
        <dd className="tabular-nums">{money(quote.total)}</dd>
      </div>
      {quote.saved > 0 && (
        <p className="text-right text-xs text-emerald-700 dark:text-emerald-400">
          You save {money(quote.saved)}
        </p>
      )}
    </dl>
  );
}
