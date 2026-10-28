import { type Invoice } from "@/features/invoices/schemas";
import { amountInWords, computeInvoiceTotals } from "@/features/invoices/tax";
import { PAYMENT_METHOD_LABELS } from "@/features/orders/schemas";
import { gstStateCode } from "@/features/orders/india";

const amount = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const money = (n: number) => amount.format(n);
const date = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

function Address({ lines }: { lines: (string | null | undefined)[] }) {
  return (
    <>
      {lines.filter(Boolean).map((line, i) => (
        <span key={i} className="block">
          {line}
        </span>
      ))}
    </>
  );
}

/** A GST tax invoice (or a plain invoice for unregistered sellers), print-ready. */
export function InvoiceDocument({ invoice }: { invoice: Invoice }) {
  const t = computeInvoiceTotals(invoice);
  const { seller, buyer } = invoice;
  const sellerState = seller.state
    ? `${seller.state}${gstStateCode(seller.state) ? ` (${gstStateCode(seller.state)})` : ""}`
    : null;
  const cityLine = (city: string | null, postalCode: string | null) =>
    [city, postalCode].filter(Boolean).join(" ") || null;
  const taxColumns = t.registered ? (t.intraState ? ["CGST", "SGST"] : ["IGST"]) : [];

  return (
    <article className="mx-auto w-full max-w-4xl rounded-xl border bg-white p-6 text-[13px] leading-relaxed text-neutral-900 shadow-sm sm:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-neutral-200 pb-6">
        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-widest text-neutral-500 uppercase">
            {t.registered ? "Tax invoice" : "Invoice"}
          </p>
          <h1 className="text-xl font-semibold">{seller.legalName}</h1>
          {seller.legalName !== seller.shopName && (
            <p className="text-neutral-600">Trading as {seller.shopName}</p>
          )}
          <p className="text-neutral-600">
            <Address
              lines={[seller.line1, cityLine(seller.city, seller.postalCode), sellerState]}
            />
          </p>
          {seller.gstin && (
            <p>
              GSTIN <span className="font-mono font-medium">{seller.gstin}</span>
            </p>
          )}
          <p className="text-neutral-600">
            {[seller.email, seller.phone].filter(Boolean).join(" · ")}
          </p>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-right">
          <dt className="text-neutral-500">Invoice no.</dt>
          <dd className="font-mono font-medium">{invoice.number}</dd>
          <dt className="text-neutral-500">Invoice date</dt>
          <dd>{date.format(new Date(invoice.issuedAt))}</dd>
          <dt className="text-neutral-500">Order no.</dt>
          <dd className="font-mono">{invoice.orderNumber}</dd>
          <dt className="text-neutral-500">Order date</dt>
          <dd>{date.format(new Date(invoice.placedAt))}</dd>
          <dt className="text-neutral-500">Payment</dt>
          <dd>
            {invoice.paymentMethod ? PAYMENT_METHOD_LABELS[invoice.paymentMethod] : "—"}
            {invoice.paymentStatus === "paid" ? " · paid" : ""}
          </dd>
        </dl>
      </header>

      <section className="grid gap-6 border-b border-neutral-200 py-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-1 text-xs font-semibold tracking-widest text-neutral-500 uppercase">
            Bill to / ship to
          </h2>
          <p className="font-medium">{buyer.name}</p>
          <p className="text-neutral-600">
            <Address
              lines={[
                buyer.line1,
                buyer.line2,
                cityLine(buyer.city, buyer.postalCode),
                buyer.state,
                buyer.phone,
              ]}
            />
          </p>
        </div>
        <div className="sm:text-right">
          <h2 className="mb-1 text-xs font-semibold tracking-widest text-neutral-500 uppercase">
            Place of supply
          </h2>
          <p>
            {t.placeOfSupply ?? "—"}
            {t.placeOfSupplyCode && ` (${t.placeOfSupplyCode})`}
          </p>
          {t.registered && <p className="text-neutral-600">Reverse charge: No</p>}
        </div>
      </section>

      <div className="overflow-x-auto py-6">
        <table className="w-full min-w-[40rem] border-collapse text-left tabular-nums">
          <thead>
            <tr className="border-b border-neutral-300 text-xs text-neutral-500">
              <th className="py-2 pr-2 font-medium">#</th>
              <th className="py-2 pr-2 font-medium">Item</th>
              <th className="py-2 pr-2 font-medium">HSN</th>
              <th className="py-2 pr-2 text-right font-medium">Qty</th>
              {t.lineDiscount > 0 && <th className="py-2 pr-2 text-right font-medium">Discount</th>}
              {t.registered && <th className="py-2 pr-2 text-right font-medium">GST %</th>}
              <th className="py-2 pr-2 text-right font-medium">
                {t.registered ? "Taxable value" : "Amount"}
              </th>
              {taxColumns.map((c) => (
                <th key={c} className="py-2 pr-2 text-right font-medium">
                  {c}
                </th>
              ))}
              {t.registered && <th className="py-2 text-right font-medium">Total</th>}
            </tr>
          </thead>
          <tbody>
            {t.lines.map((line, i) => (
              <tr key={i} className="border-b border-neutral-100 align-top">
                <td className="py-2 pr-2 text-neutral-500">{i + 1}</td>
                <td className="py-2 pr-2">{line.description}</td>
                <td className="py-2 pr-2 font-mono text-xs">{line.hsnCode ?? "—"}</td>
                <td className="py-2 pr-2 text-right">{line.quantity ?? ""}</td>
                {t.lineDiscount > 0 && (
                  <td className="py-2 pr-2 text-right">
                    {line.discount > 0 ? `−${money(line.discount)}` : ""}
                  </td>
                )}
                {t.registered && <td className="py-2 pr-2 text-right">{line.rate}</td>}
                <td className="py-2 pr-2 text-right">
                  {money(t.registered ? line.taxable : line.total)}
                </td>
                {t.registered &&
                  (t.intraState ? (
                    <>
                      <td className="py-2 pr-2 text-right">{money(line.cgst)}</td>
                      <td className="py-2 pr-2 text-right">{money(line.sgst)}</td>
                    </>
                  ) : (
                    <td className="py-2 pr-2 text-right">{money(line.igst)}</td>
                  ))}
                {t.registered && <td className="py-2 text-right">{money(line.total)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="flex flex-wrap items-start justify-between gap-6 border-t border-neutral-200 pt-6">
        <p className="max-w-sm text-neutral-600">
          <span className="block text-xs font-semibold tracking-widest text-neutral-500 uppercase">
            Amount in words
          </span>
          {amountInWords(t.total)}
          {t.lineDiscount > 0 && (
            <span className="mt-2 block text-xs">
              Includes a discount of {money(t.lineDiscount)}
              {t.discountCode ? ` (code ${t.discountCode})` : ""}, applied before tax.
            </span>
          )}
        </p>
        <dl className="grid min-w-64 grid-cols-[1fr_auto] gap-x-6 gap-y-1 tabular-nums">
          {t.registered && (
            <>
              <dt className="text-neutral-500">Taxable value</dt>
              <dd className="text-right">{money(t.taxable)}</dd>
              {t.intraState ? (
                <>
                  <dt className="text-neutral-500">CGST</dt>
                  <dd className="text-right">{money(t.cgst)}</dd>
                  <dt className="text-neutral-500">SGST</dt>
                  <dd className="text-right">{money(t.sgst)}</dd>
                </>
              ) : (
                <>
                  <dt className="text-neutral-500">IGST</dt>
                  <dd className="text-right">{money(t.igst)}</dd>
                </>
              )}
            </>
          )}
          {t.extraDiscount > 0 && (
            <>
              <dt className="text-neutral-500">Less: discount</dt>
              <dd className="text-right">−{money(t.extraDiscount)}</dd>
            </>
          )}
          <dt className="border-t border-neutral-300 pt-2 font-semibold">
            Total ({invoice.currency})
          </dt>
          <dd className="border-t border-neutral-300 pt-2 text-right font-semibold">
            {money(t.total)}
          </dd>
        </dl>
      </section>

      <footer className="mt-10 border-t border-neutral-200 pt-4 text-xs text-neutral-500">
        {t.registered
          ? "Prices include GST. This is a computer-generated invoice and needs no signature."
          : "The seller is not registered under GST. This is a computer-generated invoice and needs no signature."}
      </footer>
    </article>
  );
}
