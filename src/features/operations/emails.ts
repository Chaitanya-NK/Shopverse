import { type Digest, digestTasks, type LowStockItem } from "@/features/operations/digest";
import { formatMoney } from "@/lib/format";
import { escapeHtml } from "@/lib/html";
import { type Mail } from "@/lib/mail";

const dayFormat = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const wrap = (body: string) =>
  `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;color:#222;font-size:14px;line-height:1.5">${body}</div>`;
const button = (href: string, label: string) =>
  `<p style="margin:20px 0"><a href="${escapeHtml(href)}" style="background:#1d6b5c;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">${escapeHtml(label)}</a></p>`;

function stockRows(items: LowStockItem[]) {
  return items
    .map(
      (i) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(i.product_title)}${i.variant_title && i.variant_title !== "Default" ? ` · ${escapeHtml(i.variant_title)}` : ""}<br><span style="color:#777;font-family:monospace;font-size:12px">${escapeHtml(i.sku)}</span></td><td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(i.warehouse_name)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right"><b>${i.available}</b> / ${i.reorder_point}</td></tr>`,
    )
    .join("");
}
const stockTable = (items: LowStockItem[]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr style="text-align:left;color:#666"><th style="padding:6px 8px">Item</th><th style="padding:6px 8px">Warehouse</th><th style="padding:6px 8px;text-align:right">Available / reorder at</th></tr>${stockRows(items)}</table>`;
const variantName = (i: LowStockItem) =>
  `${i.product_title}${i.variant_title && i.variant_title !== "Default" ? ` · ${i.variant_title}` : ""}`;

/** Sent as soon as items reach their reorder point. */
export function lowStockEmail(e: {
  to: string;
  businessName: string;
  items: LowStockItem[];
  purchasingUrl: string;
}): Mail {
  const n = e.items.length;
  const subject =
    n === 1
      ? `Low stock: ${variantName(e.items[0]!)}`
      : `Low stock: ${n} items at ${e.businessName}`;
  const text = [
    `These items at ${e.businessName} are at or below their reorder point:`,
    "",
    ...e.items.map(
      (i) =>
        `- ${variantName(i)} (${i.sku}), ${i.warehouse_name}: ${i.available} left, reorder at ${i.reorder_point}`,
    ),
    "",
    `Reorder: ${e.purchasingUrl}`,
  ].join("\n");
  const html = wrap(
    `<h2 style="margin:0 0 8px">Running low</h2><p>These items at ${escapeHtml(e.businessName)} are at or below their reorder point.</p>${stockTable(e.items)}${button(e.purchasingUrl, "Reorder")}<p style="color:#777;font-size:12px">You get this because low-stock alerts are on in Alerts &amp; shipping.</p>`,
  );
  return { to: e.to, subject, text, html };
}

/** The morning summary: yesterday's sales and today's to-do list. */
export function digestEmail(e: {
  to: string;
  businessName: string;
  digest: Digest;
  dashboardUrl: string;
  purchasingUrl: string;
}): Mail {
  const d = e.digest;
  const money = formatMoney(d.sales.total, "INR");
  const day = dayFormat.format(new Date(`${d.day}T12:00:00+05:30`));
  const tasks = digestTasks(d);
  const subject = `${e.businessName}: ${d.sales.orders} order${d.sales.orders === 1 ? "" : "s"}, ${money} yesterday`;
  const text = [
    `${e.businessName} · ${day}`,
    `Sales: ${money} from ${d.sales.orders} order${d.sales.orders === 1 ? "" : "s"}.`,
    "",
    tasks.length ? "Today:" : "Nothing is waiting for you today.",
    ...tasks.map((t) => `- ${t.count} ${t.label}`),
    ...(d.low_stock.items.length
      ? [
          "",
          "Low on stock:",
          ...d.low_stock.items.map(
            (i) => `- ${variantName(i)} (${i.sku}), ${i.warehouse_name}: ${i.available} left`,
          ),
        ]
      : []),
    "",
    `Open Shopverse: ${e.dashboardUrl}`,
  ].join("\n");
  const html = wrap(
    `<p style="color:#666;margin:0">${escapeHtml(e.businessName)} · ${escapeHtml(day)}</p>
<h2 style="margin:4px 0 16px">${escapeHtml(money)} from ${d.sales.orders} order${d.sales.orders === 1 ? "" : "s"}</h2>
${
  tasks.length
    ? `<p style="margin:0 0 4px"><b>Today</b></p><ul style="margin:0 0 16px;padding-left:20px">${tasks.map((t) => `<li><b>${t.count}</b> ${escapeHtml(t.label)}</li>`).join("")}</ul>`
    : `<p>Nothing is waiting for you today.</p>`
}
${d.low_stock.items.length ? `<p style="margin:16px 0 4px"><b>Low on stock</b></p>${stockTable(d.low_stock.items)}${d.low_stock.count > d.low_stock.items.length ? `<p style="color:#666">…and ${d.low_stock.count - d.low_stock.items.length} more.</p>` : ""}${button(e.purchasingUrl, "Reorder")}` : ""}
${button(e.dashboardUrl, "Open Shopverse")}
<p style="color:#777;font-size:12px">Sent every morning while the daily digest is on in Alerts &amp; shipping.</p>`,
  );
  return { to: e.to, subject, text, html };
}
