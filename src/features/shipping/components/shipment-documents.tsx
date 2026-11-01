import { Barcode } from "@/components/shared/barcode";
import { type ShipmentDocument } from "@/features/shipping/schemas";
import { formatMoney } from "@/lib/format";

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

function addressLines(a: ShipmentDocument["order"]["shipping_address"]) {
  return [a.line1, a.line2, a.landmark, [a.city, a.state].filter(Boolean).join(", ")].filter(
    (l): l is string => Boolean(l && l.trim()),
  );
}

/** What's in the parcel, to pack against and put in the box. No prices. */
export function PackingSlip({ doc }: { doc: ShipmentDocument }) {
  const a = doc.order.shipping_address;
  const units = doc.items.reduce((n, i) => n + i.quantity, 0);
  return (
    <article className="mx-auto max-w-3xl space-y-6 rounded-xl border bg-white p-8 text-sm text-black shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex items-start justify-between gap-6">
        <div>
          <p className="text-xl font-semibold">{doc.shop.name}</p>
          <p className="text-neutral-600">Packing slip</p>
        </div>
        <div className="w-56 text-right">
          <Barcode value={doc.order.number} format="code128" height={34} />
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
        <div>
          <dt className="text-neutral-500">Order</dt>
          <dd className="font-medium">{doc.order.number}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Ordered</dt>
          <dd>{dateFormat.format(new Date(doc.order.placed_at))}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Parcel</dt>
          <dd>{doc.shipment.number ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">From</dt>
          <dd>
            {doc.warehouse.name} ({doc.warehouse.code})
          </dd>
        </div>
      </dl>

      <section>
        <h2 className="mb-1 font-semibold">Ship to</h2>
        <p className="font-medium">{a.name}</p>
        {addressLines(a).map((l) => (
          <p key={l}>{l}</p>
        ))}
        <p>
          PIN {a.postal_code} · {a.phone}
        </p>
      </section>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="w-8 py-2" aria-label="Packed" />
            <th className="py-2">Item</th>
            <th className="py-2">SKU</th>
            <th className="py-2 text-right">Qty</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((item) => (
            <tr key={`${item.sku}-${item.title}`} className="border-b align-top">
              <td className="py-2">
                <span className="inline-block size-4 border border-black" aria-hidden />
              </td>
              <td className="py-2">
                <p>{item.title}</p>
                {item.serials.length > 0 && (
                  <p className="font-mono text-xs text-neutral-600">
                    Serial/IMEI: {item.serials.join(", ")}
                  </p>
                )}
                {item.batches.length > 0 && (
                  <p className="text-xs text-neutral-600">Batch: {item.batches.join(", ")}</p>
                )}
              </td>
              <td className="py-2 font-mono text-xs">{item.sku}</td>
              <td className="py-2 text-right tabular-nums">{item.quantity}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="py-2 text-right font-medium">
              Units
            </td>
            <td className="py-2 text-right font-medium tabular-nums">{units}</td>
          </tr>
        </tfoot>
      </table>

      {doc.order.note && (
        <section>
          <h2 className="mb-1 font-semibold">Note from the customer</h2>
          <p className="whitespace-pre-line">{doc.order.note}</p>
        </section>
      )}

      <footer className="border-t pt-3 text-xs text-neutral-600">
        Thank you for shopping with {doc.shop.name}.
        {doc.shop.phone || doc.shop.email
          ? ` Questions? ${[doc.shop.phone, doc.shop.email].filter(Boolean).join(" · ")}`
          : ""}
      </footer>
    </article>
  );
}

/** A 4 × 6 inch thermal shipping label: AWB, both addresses, COD amount. */
export function ShippingLabel({ doc }: { doc: ShipmentDocument }) {
  const a = doc.order.shipping_address;
  const w = doc.warehouse.address;
  const pkg = doc.shipment.package;
  const cod =
    doc.order.payment_method === "cod" && doc.order.payment_status !== "paid"
      ? (doc.shipment.cod_amount ?? doc.order.grand_total)
      : null;
  return (
    <>
      <style>{`@media print { @page { size: 4in 6in; margin: 0; } }`}</style>
      <article
        aria-label="Shipping label"
        className="mx-auto flex h-[6in] w-[4in] flex-col overflow-hidden border-2 border-black bg-white text-[11px] leading-tight text-black print:border-0"
      >
        <header className="flex items-center justify-between border-b-2 border-black px-3 py-2">
          <span className="text-sm font-bold">{doc.shipment.carrier ?? "Self-ship"}</span>
          <span className="font-semibold uppercase">{doc.shipment.service ?? ""}</span>
        </header>
        <div className="border-b-2 border-black px-3 py-2">
          {doc.shipment.awb ? (
            <Barcode value={doc.shipment.awb} format="code128" height={46} />
          ) : (
            <p className="py-4 text-center text-sm font-semibold">No AWB yet: book a courier</p>
          )}
        </div>
        <section className="flex-1 border-b-2 border-black px-3 py-2">
          <p className="text-[10px] font-semibold uppercase">Deliver to</p>
          <p className="text-sm font-bold">{a.name}</p>
          {addressLines(a).map((l) => (
            <p key={l}>{l}</p>
          ))}
          <p className="mt-1 text-lg font-bold tracking-wider">PIN {a.postal_code}</p>
          <p>Phone {a.phone}</p>
        </section>
        <div className="grid grid-cols-2 border-b-2 border-black">
          <div className="border-r-2 border-black px-3 py-2">
            {cod !== null ? (
              <>
                <p className="text-[10px] font-semibold uppercase">Collect cash</p>
                <p className="text-lg font-bold">{formatMoney(cod, doc.order.currency)}</p>
              </>
            ) : (
              <p className="text-lg font-bold">PREPAID</p>
            )}
          </div>
          <div className="px-3 py-2">
            <p>
              Weight <b>{pkg?.weight_grams ? `${(pkg.weight_grams / 1000).toFixed(2)} kg` : "—"}</b>
            </p>
            {pkg?.length_cm && (
              <p>
                {pkg.length_cm}×{pkg.breadth_cm}×{pkg.height_cm} cm
              </p>
            )}
            <p>{dateFormat.format(new Date(doc.shipment.booked_at ?? doc.shipment.created_at))}</p>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] items-center gap-2 border-b-2 border-black px-3 py-2">
          <div>
            <p className="text-[10px] font-semibold uppercase">Order</p>
            <p className="font-bold">{doc.order.number}</p>
            <p>{doc.shipment.number}</p>
          </div>
          <div className="w-32">
            <Barcode value={doc.order.number} format="code128" height={26} showText={false} />
          </div>
        </div>
        <footer className="px-3 py-2">
          <p className="text-[10px] font-semibold uppercase">If undelivered, return to</p>
          <p className="font-semibold">{doc.shop.legal_name || doc.shop.name}</p>
          <p>
            {[w.line1, w.city, w.state, w.postalCode].filter(Boolean).join(", ")}
            {doc.shop.phone ? ` · ${doc.shop.phone}` : ""}
          </p>
          {doc.shop.gstin && <p>GSTIN {doc.shop.gstin}</p>}
        </footer>
      </article>
    </>
  );
}
