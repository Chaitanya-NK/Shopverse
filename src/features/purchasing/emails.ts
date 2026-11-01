import { formatMoney } from "@/lib/format";
import { escapeHtml } from "@/lib/html";
import { type Mail } from "@/lib/mail";

export type PurchaseOrderEmail = {
  to: string;
  replyTo: string | null;
  businessName: string;
  supplierName: string;
  number: string;
  expectedAt: string | null;
  deliverTo: { name: string; address: string };
  notes: string | null;
  lines: { sku: string; title: string; quantity: number; unitCost: number; taxRate: number }[];
  subtotal: number;
  tax: number;
  total: number;
};

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** The purchase order as an email to the supplier. */
export function purchaseOrderEmail(e: PurchaseOrderEmail): Mail {
  const money = (n: number) => formatMoney(n, "INR");
  const expected = e.expectedAt ? dateFormat.format(new Date(`${e.expectedAt}T00:00:00`)) : null;
  const rows = e.lines
    .map(
      (l) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(l.title)}<br><span style="color:#777;font-family:monospace;font-size:12px">${escapeHtml(l.sku)}</span></td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${l.quantity}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${escapeHtml(money(l.unitCost))}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${l.taxRate}%</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${escapeHtml(money(l.quantity * l.unitCost))}</td></tr>`,
    )
    .join("");
  const text = [
    `Purchase order ${e.number} from ${e.businessName}`,
    "",
    `Hello ${e.supplierName},`,
    `Please supply the following${expected ? ` by ${expected}` : ""}.`,
    "",
    ...e.lines.map(
      (l) => `${l.quantity} × ${l.title} (${l.sku}) @ ${money(l.unitCost)} + ${l.taxRate}% GST`,
    ),
    "",
    `Subtotal ${money(e.subtotal)} · GST ${money(e.tax)} · Total ${money(e.total)}`,
    `Deliver to: ${e.deliverTo.name}, ${e.deliverTo.address}`,
    e.notes ? `Notes: ${e.notes}` : "",
    "",
    `Please quote ${e.number} on your invoice and delivery challan.`,
  ]
    .filter((l) => l !== null)
    .join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;color:#222">
<h2 style="margin:0 0 4px">Purchase order ${escapeHtml(e.number)}</h2>
<p style="margin:0 0 16px;color:#666">From ${escapeHtml(e.businessName)}</p>
<p>Hello ${escapeHtml(e.supplierName)}, please supply the following${expected ? ` by <b>${escapeHtml(expected)}</b>` : ""}.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse">
<tr style="text-align:left;color:#666"><th style="padding:6px 8px">Item</th><th style="padding:6px 8px;text-align:right">Qty</th><th style="padding:6px 8px;text-align:right">Rate</th><th style="padding:6px 8px;text-align:right">GST</th><th style="padding:6px 8px;text-align:right">Amount</th></tr>
${rows}
<tr><td colspan="4" style="padding:6px 8px;text-align:right">Subtotal</td><td style="padding:6px 8px;text-align:right">${escapeHtml(money(e.subtotal))}</td></tr>
<tr><td colspan="4" style="padding:6px 8px;text-align:right">GST</td><td style="padding:6px 8px;text-align:right">${escapeHtml(money(e.tax))}</td></tr>
<tr><td colspan="4" style="padding:6px 8px;text-align:right;font-weight:700">Total</td><td style="padding:6px 8px;text-align:right;font-weight:700">${escapeHtml(money(e.total))}</td></tr>
</table>
<p><b>Deliver to:</b> ${escapeHtml(e.deliverTo.name)}, ${escapeHtml(e.deliverTo.address)}</p>
${e.notes ? `<p><b>Notes:</b> ${escapeHtml(e.notes)}</p>` : ""}
<p style="color:#666">Please quote ${escapeHtml(e.number)} on your invoice and delivery challan.</p></div>`;
  return {
    to: e.to,
    replyTo: e.replyTo,
    subject: `Purchase order ${e.number} from ${e.businessName}`,
    text,
    html,
  };
}
