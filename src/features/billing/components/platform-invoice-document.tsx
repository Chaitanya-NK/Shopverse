import { PLAN_NAMES } from "@/config/plans";
import { type PlatformInvoice } from "@/features/billing/queries";
import { amountInWords } from "@/features/invoices/tax";
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
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

function Party({ party, title }: { party: Record<string, unknown>; title?: string }) {
  const state = str(party.state);
  const code = state ? gstStateCode(state) : null;
  return (
    <div>
      <h2 className="mb-1 text-xs font-semibold tracking-widest text-neutral-500 uppercase">
        {title}
      </h2>
      <p className="font-medium">{str(party.legal_name)}</p>
      <p className="text-neutral-600">
        {[
          str(party.line1),
          [str(party.city), str(party.postal_code)].filter(Boolean).join(" "),
          state && `${state}${code ? ` (${code})` : ""}`,
        ]
          .filter(Boolean)
          .map((line) => (
            <span key={line as string} className="block">
              {line}
            </span>
          ))}
      </p>
      {str(party.gstin) && (
        <p>
          GSTIN <span className="font-mono font-medium">{str(party.gstin)}</span>
        </p>
      )}
      {str(party.email) && <p className="text-neutral-600">{str(party.email)}</p>}
    </div>
  );
}

/** Shopverse's invoice to a business for its plan, print-ready. */
export function PlatformInvoiceDocument({ invoice }: { invoice: PlatformInvoice }) {
  const registered = Boolean(str(invoice.seller.gstin));
  const intra = invoice.cgst > 0 || invoice.sgst > 0;
  const period =
    invoice.period_start && invoice.period_end
      ? `${date.format(new Date(invoice.period_start))} – ${date.format(new Date(invoice.period_end))}`
      : null;
  return (
    <article className="mx-auto w-full max-w-4xl rounded-xl border bg-white p-6 text-[13px] leading-relaxed text-neutral-900 shadow-sm sm:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-neutral-200 pb-6">
        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-widest text-neutral-500 uppercase">
            {registered ? "Tax invoice" : "Invoice"}
          </p>
          <Party party={invoice.seller} />
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-right">
          <dt className="text-neutral-500">Invoice no.</dt>
          <dd className="font-mono font-medium">{invoice.number}</dd>
          <dt className="text-neutral-500">Date</dt>
          <dd>{date.format(new Date(invoice.issued_at))}</dd>
          <dt className="text-neutral-500">Payment</dt>
          <dd>
            Paid · <span className="font-mono text-xs">{invoice.provider_payment_id}</span>
          </dd>
        </dl>
      </header>
      <section className="grid gap-6 border-b border-neutral-200 py-6 sm:grid-cols-2">
        <Party party={invoice.buyer} title="Billed to" />
        {registered && (
          <div className="sm:text-right">
            <h2 className="mb-1 text-xs font-semibold tracking-widest text-neutral-500 uppercase">
              Place of supply
            </h2>
            <p>{str(invoice.buyer.state) ?? "—"}</p>
            <p className="text-neutral-600">Reverse charge: No</p>
          </div>
        )}
      </section>
      <div className="overflow-x-auto py-6">
        <table className="w-full min-w-[36rem] border-collapse text-left tabular-nums">
          <thead>
            <tr className="border-b border-neutral-300 text-xs text-neutral-500">
              <th className="py-2 pr-2 font-medium">Description</th>
              {registered && <th className="py-2 pr-2 font-medium">SAC</th>}
              {registered && <th className="py-2 pr-2 text-right font-medium">GST %</th>}
              <th className="py-2 text-right font-medium">
                {registered ? "Taxable value" : "Amount"}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-neutral-100 align-top">
              <td className="py-2 pr-2">
                Shopverse {PLAN_NAMES[invoice.plan]} plan, billed {invoice.interval}
                {period && <span className="block text-neutral-500">{period}</span>}
              </td>
              {registered && <td className="py-2 pr-2 font-mono text-xs">{invoice.sac_code}</td>}
              {registered && <td className="py-2 pr-2 text-right">{invoice.gst_rate}</td>}
              <td className="py-2 text-right">{money(invoice.taxable)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <section className="flex flex-wrap items-start justify-between gap-6 border-t border-neutral-200 pt-6">
        <p className="max-w-sm text-neutral-600">
          <span className="block text-xs font-semibold tracking-widest text-neutral-500 uppercase">
            Amount in words
          </span>
          {amountInWords(invoice.total)}
        </p>
        <dl className="grid min-w-64 grid-cols-[1fr_auto] gap-x-6 gap-y-1 tabular-nums">
          {registered && (
            <>
              <dt className="text-neutral-500">Taxable value</dt>
              <dd className="text-right">{money(invoice.taxable)}</dd>
              {intra ? (
                <>
                  <dt className="text-neutral-500">CGST {invoice.gst_rate / 2}%</dt>
                  <dd className="text-right">{money(invoice.cgst)}</dd>
                  <dt className="text-neutral-500">SGST {invoice.gst_rate / 2}%</dt>
                  <dd className="text-right">{money(invoice.sgst)}</dd>
                </>
              ) : (
                <>
                  <dt className="text-neutral-500">IGST {invoice.gst_rate}%</dt>
                  <dd className="text-right">{money(invoice.igst)}</dd>
                </>
              )}
            </>
          )}
          <dt className="border-t border-neutral-300 pt-2 font-semibold">Total (INR)</dt>
          <dd className="border-t border-neutral-300 pt-2 text-right font-semibold">
            {money(invoice.total)}
          </dd>
        </dl>
      </section>
      <footer className="mt-10 border-t border-neutral-200 pt-4 text-xs text-neutral-500">
        Paid by subscription through Stripe. This is a computer-generated invoice and needs no
        signature.
      </footer>
    </article>
  );
}
