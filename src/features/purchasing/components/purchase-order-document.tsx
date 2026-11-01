import { type PurchaseOrderDetail } from "@/features/purchasing/queries";
import { formatMoney } from "@/lib/format";

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});
const address = (a: { line1: string; city: string; state: string; postalCode: string }) =>
  [a.line1, [a.city, a.state].filter(Boolean).join(", "), a.postalCode].filter(Boolean);

/** The purchase order as a printable A4 document. */
export function PurchaseOrderDocument({
  po,
  business,
}: {
  po: PurchaseOrderDetail;
  business: { name: string; gstin: string | null };
}) {
  const money = (n: number) => formatMoney(n, "INR");
  return (
    <article className="mx-auto max-w-4xl space-y-8 rounded-xl border bg-white p-8 text-sm text-neutral-900 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold">Purchase order</h1>
          <p className="font-mono text-base">{po.number}</p>
        </div>
        <div className="text-right">
          <p className="font-semibold">{business.name}</p>
          {business.gstin && <p>GSTIN {business.gstin}</p>}
          <p>Date {dateFormat.format(new Date(po.orderedAt ?? po.createdAt))}</p>
          {po.expectedAt && (
            <p>Deliver by {dateFormat.format(new Date(`${po.expectedAt}T00:00:00`))}</p>
          )}
          {po.supplierReference && <p>Your ref. {po.supplierReference}</p>}
        </div>
      </header>
      <section className="grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-1 text-xs font-medium tracking-wide text-neutral-500 uppercase">
            Supplier
          </h2>
          <p className="font-medium">{po.supplier.name}</p>
          {address(po.supplier.address).map((l) => (
            <p key={l}>{l}</p>
          ))}
          {po.supplier.gstin && <p>GSTIN {po.supplier.gstin}</p>}
          {[po.supplier.contactName, po.supplier.phone, po.supplier.email]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <div>
          <h2 className="mb-1 text-xs font-medium tracking-wide text-neutral-500 uppercase">
            Deliver to
          </h2>
          <p className="font-medium">
            {po.warehouse.name} ({po.warehouse.code})
          </p>
          {address(po.warehouse.address).map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      </section>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b text-left text-xs text-neutral-500 uppercase">
            <th className="py-2 pr-2">#</th>
            <th className="py-2 pr-2">Item</th>
            <th className="py-2 pr-2 text-right">Qty</th>
            <th className="py-2 pr-2 text-right">Rate</th>
            <th className="py-2 pr-2 text-right">GST</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {po.lines.map((l, i) => (
            <tr key={l.id} className="border-b align-top">
              <td className="py-2 pr-2">{i + 1}</td>
              <td className="py-2 pr-2">
                {l.productTitle}
                {l.title !== "Default" ? ` · ${l.title}` : ""}
                <div className="font-mono text-xs text-neutral-500">{l.sku}</div>
              </td>
              <td className="py-2 pr-2 text-right tabular-nums">{l.quantity}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{money(l.unitCost)}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{l.taxRate}%</td>
              <td className="py-2 text-right tabular-nums">{money(l.quantity * l.unitCost)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5} className="pt-3 pr-2 text-right">
              Subtotal
            </td>
            <td className="pt-3 text-right tabular-nums">{money(po.subtotal)}</td>
          </tr>
          <tr>
            <td colSpan={5} className="pr-2 text-right">
              GST
            </td>
            <td className="text-right tabular-nums">{money(po.taxTotal)}</td>
          </tr>
          <tr className="font-semibold">
            <td colSpan={5} className="pr-2 text-right">
              Total
            </td>
            <td className="text-right tabular-nums">{money(po.total)}</td>
          </tr>
        </tfoot>
      </table>
      {po.notes && (
        <section>
          <h2 className="mb-1 text-xs font-medium tracking-wide text-neutral-500 uppercase">
            Notes
          </h2>
          <p className="whitespace-pre-line">{po.notes}</p>
        </section>
      )}
      <p className="text-xs text-neutral-500">
        Please quote {po.number} on your invoice and delivery challan.
      </p>
    </article>
  );
}
