import { siteConfig } from "@/config/site";
import { formatMoney } from "@/lib/format";
import { escapeHtml } from "@/lib/html";
import { type Mail } from "@/lib/mail";

const BRAND = "#1d6b5c";

function layout(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:16px;padding:32px" cellpadding="0" cellspacing="0"><tr><td>
<p style="margin:0 0 20px;font-weight:700;color:${BRAND}">${siteConfig.name}</p>
<h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(title)}</h1>${body}
<p style="margin:24px 0 0;color:#888;font-size:12px">Questions? Reply to this email or write to ${escapeHtml(siteConfig.supportEmail)}.</p>
</td></tr></table></td></tr></table></body></html>`;
}
const p = (html: string) => `<p style="margin:0 0 12px;color:#444;line-height:1.5">${html}</p>`;
const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="background:${BRAND};color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;display:inline-block;font-weight:600">${escapeHtml(label)}</a></p>`;

export type BillingEmail =
  | { type: "receipt"; invoiceNumber: string; amount: number; planName: string; invoiceUrl: string }
  | { type: "payment_failed"; planName: string; updateUrl: string | null; graceEndsAt: string }
  | { type: "plan_ended"; planName: string; billingUrl: string };

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  timeZone: "Asia/Kolkata",
});

/** Emails to a business about its Shopverse plan. */
export function billingEmail(to: string, business: string, e: BillingEmail): Mail {
  const name = escapeHtml(business);
  switch (e.type) {
    case "receipt": {
      const amount = formatMoney(e.amount, "INR");
      return {
        to,
        subject: `Shopverse invoice ${e.invoiceNumber} · ${amount} paid`,
        text: `Thanks! We received ${amount} for ${business}'s ${e.planName} plan. Invoice ${e.invoiceNumber}: ${e.invoiceUrl}`,
        html: layout(
          "Payment received",
          p(
            `We received <b>${escapeHtml(amount)}</b> for ${name}'s <b>${escapeHtml(e.planName)}</b> plan.`,
          ) + button(e.invoiceUrl, `View invoice ${e.invoiceNumber}`),
        ),
      };
    }
    case "payment_failed": {
      const until = dateFormat.format(new Date(e.graceEndsAt));
      return {
        to,
        subject: `Action needed: your Shopverse payment didn't go through`,
        text: `We couldn't charge for ${business}'s ${e.planName} plan. Your shops keep selling. Update your payment by ${until} to keep adding products, shops and teammates.${e.updateUrl ? `\nUpdate payment: ${e.updateUrl}` : ""}`,
        html: layout(
          "Your payment didn't go through",
          p(
            `We couldn't charge for ${name}'s <b>${escapeHtml(e.planName)}</b> plan. Razorpay will try again.`,
          ) +
            p(
              `Your shops keep selling. Please update your payment by <b>${escapeHtml(until)}</b>; after that, adding products, shops and teammates is paused until it's sorted.`,
            ) +
            (e.updateUrl ? button(e.updateUrl, "Update payment") : ""),
        ),
      };
    }
    case "plan_ended":
      return {
        to,
        subject: `Your Shopverse ${e.planName} plan has ended`,
        text: `${business}'s ${e.planName} plan has ended. Your shops keep selling; choose a plan to add more: ${e.billingUrl}`,
        html: layout(
          "Your plan has ended",
          p(
            `${name}'s <b>${escapeHtml(e.planName)}</b> plan has ended. Your shops, orders and stock carry on; adding products, shops and teammates needs a plan.`,
          ) + button(e.billingUrl, "Choose a plan"),
        ),
      };
  }
}
