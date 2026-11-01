import { formatMoney } from "@/lib/format";
import { escapeHtml } from "@/lib/html";
import { makeTranslate, type Translate } from "@/i18n/core";
import { type Mail } from "@/lib/mail";

export type CartReminder = {
  to: string;
  name: string | null;
  shopName: string;
  color: string;
  items: { title: string; quantity: number; price: number; imageUrl: string | null }[];
  subtotal: number;
  discountCode: string | null;
  restoreUrl: string;
  stopUrl: string;
  supportEmail: string | null;
  /** The shop's language (English when not given). */
  t?: Translate;
};

const english = makeTranslate("en", null);

/** One gentle reminder about a cart left behind. */
export function cartReminderEmail(e: CartReminder): Mail {
  const t = e.t ?? english;
  const money = (n: number) => formatMoney(n, "INR");
  const first = e.name?.trim().split(/\s+/)[0];
  const subject = first
    ? t("{name}, you left something in your {shop} cart", { name: first, shop: e.shopName })
    : t("You left something in your {shop} cart", { shop: e.shopName });
  const text = [
    first ? t("Hi {name},", { name: first }) : t("Hello,"),
    t("You left these in your cart at {shop}:", { shop: e.shopName }),
    "",
    ...e.items.map((i) => `- ${i.quantity} × ${i.title} (${money(i.price)})`),
    "",
    e.discountCode
      ? t("Use code {code} at checkout for a little off.", { code: e.discountCode })
      : "",
    t("Pick up where you left off: {url}", { url: e.restoreUrl }),
    "",
    t("Don't want reminders like this? {url}", { url: e.stopUrl }),
  ]
    .filter((l) => l !== "")
    .join("\n");
  const rows = e.items
    .map(
      (i) =>
        `<tr>${i.imageUrl ? `<td style="padding:8px 8px 8px 0;width:64px"><img src="${escapeHtml(i.imageUrl)}" width="56" height="56" alt="" style="border-radius:8px;object-fit:cover;display:block"></td>` : `<td style="width:0"></td>`}<td style="padding:8px">${escapeHtml(i.title)}<br><span style="color:#777">${escapeHtml(t("Qty {count}", { count: i.quantity }))}</span></td><td style="padding:8px;text-align:right;white-space:nowrap">${escapeHtml(money(i.price * i.quantity))}</td></tr>`,
    )
    .join("");
  const color = /^#[0-9a-f]{6}$/i.test(e.color) ? e.color : "#1d6b5c";
  const html = `<div lang="${t.locale}" style="font-family:system-ui,'Noto Sans Devanagari',sans-serif;max-width:560px;margin:0 auto;color:#222;font-size:14px;line-height:1.5">
<p style="font-size:18px;font-weight:600;margin:0 0 12px">${escapeHtml(e.shopName)}</p>
<p>${escapeHtml(first ? t("Hi {name}, you left these in your cart:", { name: first }) : t("You left these in your cart:"))}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>
<p style="text-align:right;margin:8px 0 0"><b>${escapeHtml(money(e.subtotal))}</b></p>
${e.discountCode ? `<p style="background:#f5f5f4;border-radius:8px;padding:10px 12px">${t("Use code {code} at checkout for a little off.", { code: `<b style="font-family:monospace">${escapeHtml(e.discountCode)}</b>` })}</p>` : ""}
<p style="margin:20px 0"><a href="${escapeHtml(e.restoreUrl)}" style="background:${color};color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block">${escapeHtml(t("Back to my cart"))}</a></p>
<p style="color:#888;font-size:12px">${escapeHtml(t("This is the only reminder we'll send about this cart."))} <a href="${escapeHtml(e.stopUrl)}" style="color:#888">${escapeHtml(t("Don't send me cart reminders"))}</a>${e.supportEmail ? ` · ${escapeHtml(t("Questions?"))} ${escapeHtml(e.supportEmail)}` : ""}</p>
</div>`;
  return { to: e.to, subject, text, html };
}
