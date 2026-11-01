import { formatMoney } from "@/lib/format";
import { escapeHtml } from "@/lib/html";
import { makeTranslate, type Translate } from "@/i18n/core";
import { type Mail } from "@/lib/mail";

/** Everything an order email needs, loaded by the notifier. */
export type OrderEmailContext = {
  to: string;
  customerName: string | null;
  shopName: string;
  supportEmail: string | null;
  supportPhone: string | null;
  orderNumber: string;
  orderUrl: string;
  invoiceUrl: string | null;
  total: number;
  shipping: number;
  /** Discount on the order, with its code if one was used. */
  discount: { amount: number; code: string | null } | null;
  currency: string;
  cashOnDelivery: boolean;
  items: { title: string; quantity: number; total: number }[];
  /** The language the customer ordered in (English when not given). */
  t?: Translate;
};

export type OrderEmailEvent =
  | { type: "confirmed" }
  | {
      type: "shipped";
      shipmentNumber: string;
      trackingUrl: string;
      carrier: string | null;
      trackingNumber: string | null;
    }
  | { type: "out_for_delivery"; shipmentNumber: string; trackingUrl: string; otp: string }
  | { type: "delivery_failed"; shipmentNumber: string; trackingUrl: string }
  | { type: "delivered"; shipmentNumber: string }
  | { type: "cancelled"; byCustomer: boolean }
  | ReturnEmailEvent;

/** Return updates; amounts are in the order's currency. */
export type ReturnEmailEvent =
  | { type: "return_requested"; returnNumber: string; exchange: boolean; items: string[] }
  | { type: "return_approved"; returnNumber: string; note: string | null }
  | { type: "return_rejected"; returnNumber: string; note: string | null }
  | {
      type: "return_received";
      returnNumber: string;
      exchange: boolean;
      refundAmount: number;
      creditNoteUrl: string | null;
    }
  | { type: "return_refunded"; returnNumber: string; amount: number; method: string };

const BRAND = "#1d6b5c";
const english = makeTranslate("en", null);

function button(href: string, label: string) {
  return `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="background:${BRAND};color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;display:inline-block;font-weight:600">${escapeHtml(label)}</a></p>`;
}

function paragraph(text: string) {
  return `<p style="margin:0 0 12px;color:#444;line-height:1.5">${text}</p>`;
}

/** Escape every value before it goes into a (trusted) sentence template. */
function esc(vars: Record<string, string | number>) {
  return Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, escapeHtml(String(v))]));
}
const b = (value: string) => `<b>${escapeHtml(value)}</b>`;

function itemsTable(ctx: OrderEmailContext, t: Translate) {
  const rows = ctx.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0;color:#333">${i.quantity} × ${escapeHtml(i.title)}</td><td style="padding:6px 0;text-align:right;color:#333;white-space:nowrap">${escapeHtml(formatMoney(i.total, ctx.currency))}</td></tr>`,
    )
    .join("");
  const discount =
    ctx.discount && ctx.discount.amount > 0
      ? `<tr><td style="padding:6px 0;color:#15803d">${escapeHtml(ctx.discount.code ? t("Discount ({code})", { code: ctx.discount.code }) : t("Discount"))}</td><td style="padding:6px 0;text-align:right;color:#15803d;white-space:nowrap">−${escapeHtml(formatMoney(ctx.discount.amount, ctx.currency))}</td></tr>`
      : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;border-bottom:1px solid #eee;margin:16px 0;font-size:14px">${rows}${discount}
<tr><td style="padding:6px 0;color:#333">${escapeHtml(t("Delivery"))}</td><td style="padding:6px 0;text-align:right;color:#333;white-space:nowrap">${ctx.shipping > 0 ? escapeHtml(formatMoney(ctx.shipping, ctx.currency)) : escapeHtml(t("Free"))}</td></tr>
<tr><td style="padding:10px 0;font-weight:700">${escapeHtml(t("Total"))}</td><td style="padding:10px 0;text-align:right;font-weight:700">${escapeHtml(formatMoney(ctx.total, ctx.currency))}</td></tr></table>`;
}

function layout(ctx: OrderEmailContext, t: Translate, title: string, body: string) {
  const contact = [ctx.supportEmail, ctx.supportPhone]
    .filter(Boolean)
    .map((c) => escapeHtml(c!))
    .join(" · ");
  return `<!doctype html>
<html lang="${t.locale}"><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,'Noto Sans Devanagari',sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:16px;padding:32px" cellpadding="0" cellspacing="0"><tr><td>
<p style="margin:0 0 20px;font-weight:700;color:${BRAND}">${escapeHtml(ctx.shopName)}</p>
<h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(title)}</h1>
${body}
<p style="margin:24px 0 0;color:#888;font-size:12px">${escapeHtml(t("Order {number}", { number: ctx.orderNumber }))}${contact ? ` · ${escapeHtml(t("Questions?"))} ${contact}` : ""}</p>
</td></tr></table>
<p style="color:#999;font-size:12px;margin-top:16px">${escapeHtml(t("Sent by Shopverse on behalf of {shop}.", { shop: ctx.shopName }))}</p>
</td></tr></table></body></html>`;
}

const hello = (ctx: OrderEmailContext, t: Translate) =>
  ctx.customerName
    ? escapeHtml(t("Hi {name},", { name: ctx.customerName.split(" ")[0]! }))
    : escapeHtml(t("Hello,"));

/** Subject, text and HTML for one order event, in the customer's language. */
export function orderEventEmail(ctx: OrderEmailContext, event: OrderEmailEvent): Mail {
  const t = ctx.t ?? english;
  const total = formatMoney(ctx.total, ctx.currency);
  const shop = ctx.shopName;
  const base = { to: ctx.to, replyTo: ctx.supportEmail };
  const html = (title: string, body: string) => layout(ctx, t, title, body);
  const hi = hello(ctx, t);
  const viewOrder = button(ctx.orderUrl, t("View your order"));

  switch (event.type) {
    case "confirmed":
      return {
        ...base,
        subject: t("Order {number} confirmed · {shop}", { number: ctx.orderNumber, shop }),
        text:
          t(
            ctx.cashOnDelivery
              ? "Thanks for your order! {number} ({total}, cash on delivery) is confirmed."
              : "Thanks for your order! {number} ({total}) is confirmed.",
            { number: ctx.orderNumber, total },
          ) + `\n${t("View it:")} ${ctx.orderUrl}`,
        html: html(
          t("Thanks for your order!"),
          paragraph(
            t("{hello} we've received your order and are getting it ready.", { hello: hi }),
          ) +
            itemsTable(ctx, t) +
            (ctx.cashOnDelivery
              ? paragraph(
                  escapeHtml(
                    t(
                      "Pay in cash or UPI when it arrives. We'll email a delivery code when it's out for delivery.",
                    ),
                  ),
                )
              : "") +
            viewOrder,
        ),
      };
    case "shipped": {
      const via = event.carrier
        ? event.trackingNumber
          ? t(
              " with {carrier} (tracking number {tracking})",
              esc({ carrier: event.carrier, tracking: event.trackingNumber }),
            )
          : t(" with {carrier}", esc({ carrier: event.carrier }))
        : "";
      return {
        ...base,
        subject: t("Your {shop} order is on its way", { shop }),
        text:
          t("Good news: order {number} has shipped (parcel {parcel}).", {
            number: ctx.orderNumber,
            parcel: event.shipmentNumber,
          }) + `\n${t("Track it:")} ${event.trackingUrl}`,
        html: html(
          t("Your order is on its way"),
          paragraph(
            t("{hello} parcel {parcel} has left our warehouse{via}.", {
              hello: hi,
              parcel: b(event.shipmentNumber),
              via,
            }),
          ) +
            button(event.trackingUrl, t("Track your parcel")) +
            (ctx.invoiceUrl
              ? paragraph(
                  t("Your invoice is ready: {link}.", {
                    link: `<a href="${escapeHtml(ctx.invoiceUrl)}" style="color:${BRAND}">${escapeHtml(t("view or download it"))}</a>`,
                  }),
                )
              : ""),
        ),
      };
    }
    case "out_for_delivery":
      return {
        ...base,
        subject: t("{code} is your delivery code · {shop}", { code: event.otp, shop }),
        text:
          `${t("Your {shop} order is out for delivery today.", { shop })}\n` +
          `${t("Your delivery code is {code}. Share it with the courier only after you have your parcel.", { code: event.otp })}\n` +
          (ctx.cashOnDelivery
            ? `${t("Please keep {total} ready (cash or UPI).", { total })}\n`
            : "") +
          `${t("Track it:")} ${event.trackingUrl}`,
        html: html(
          t("Out for delivery today"),
          paragraph(
            t("{hello} parcel {parcel} will reach you today. Your delivery code:", {
              hello: hi,
              parcel: b(event.shipmentNumber),
            }),
          ) +
            `<p style="font-size:34px;letter-spacing:8px;font-weight:700;margin:8px 0 16px;font-family:monospace">${escapeHtml(event.otp)}</p>` +
            paragraph(
              t(
                "Share it with the courier <b>only after</b> you have your parcel. Nobody from the shop will ask for it on the phone.",
              ),
            ) +
            (ctx.cashOnDelivery
              ? paragraph(t("Please keep {total} ready in cash or UPI.", { total: b(total) }))
              : "") +
            button(event.trackingUrl, t("Track your parcel")),
        ),
      };
    case "delivery_failed":
      return {
        ...base,
        subject: t("We missed you · {shop} order {number}", { shop, number: ctx.orderNumber }),
        text:
          t(
            "We couldn't deliver parcel {parcel} today. We'll try again; your new delivery code will come by email.",
            { parcel: event.shipmentNumber },
          ) + `\n${t("Track it:")} ${event.trackingUrl}`,
        html: html(
          t("We couldn't deliver today"),
          paragraph(
            t(
              "{hello} the courier couldn't deliver parcel {parcel}. We'll try again soon and email you a new delivery code.",
              { hello: hi, parcel: b(event.shipmentNumber) },
            ),
          ) +
            paragraph(
              escapeHtml(t("If you'd like to change the time or address, reply to this email.")),
            ) +
            button(event.trackingUrl, t("Track your parcel")),
        ),
      };
    case "delivered":
      return {
        ...base,
        subject: t("Delivered: your {shop} order", { shop }),
        text:
          t(
            "Parcel {parcel} of order {number} was delivered. Thank you for shopping with {shop}!",
            {
              parcel: event.shipmentNumber,
              number: ctx.orderNumber,
              shop,
            },
          ) + (ctx.invoiceUrl ? `\n${t("Invoice:")} ${ctx.invoiceUrl}` : ""),
        html: html(
          t("Delivered. Enjoy!"),
          paragraph(
            t("{hello} parcel {parcel} has been delivered. Thank you for shopping with {shop}.", {
              hello: hi,
              parcel: b(event.shipmentNumber),
              shop: escapeHtml(shop),
            }),
          ) +
            (ctx.invoiceUrl ? button(ctx.invoiceUrl, t("Download your invoice")) : viewOrder) +
            paragraph(escapeHtml(t("Something not right? Reply to this email and we'll help."))),
        ),
      };
    case "cancelled":
      return {
        ...base,
        subject: t("Order {number} cancelled · {shop}", { number: ctx.orderNumber, shop }),
        text: event.byCustomer
          ? t("As you asked, order {number} has been cancelled. Nothing more to do.", {
              number: ctx.orderNumber,
            })
          : t(
              "We're sorry: order {number} has been cancelled by {shop}. Reply to this email if you have questions.",
              { number: ctx.orderNumber, shop },
            ),
        html: html(
          t("Your order is cancelled"),
          paragraph(
            event.byCustomer
              ? t("{hello} as you asked, we've cancelled order {number}.", {
                  hello: hi,
                  number: b(ctx.orderNumber),
                })
              : t("{hello} we're sorry, but {shop} had to cancel order {number}.", {
                  hello: hi,
                  shop: escapeHtml(shop),
                  number: b(ctx.orderNumber),
                }),
          ) +
            paragraph(
              escapeHtml(
                ctx.cashOnDelivery
                  ? t("It was cash on delivery, so there's nothing to pay or refund.")
                  : t("If you paid, the refund will follow."),
              ),
            ) +
            button(ctx.orderUrl, t("View order")),
        ),
      };
    case "return_requested":
      return {
        ...base,
        subject: t("Return {number} requested · {shop}", { number: event.returnNumber, shop }),
        text:
          t(
            event.exchange
              ? "We've got your exchange request {number} for order {order}. We'll let you know once it's reviewed."
              : "We've got your return request {number} for order {order}. We'll let you know once it's reviewed.",
            { number: event.returnNumber, order: ctx.orderNumber },
          ) + `\n${t("View it:")} ${ctx.orderUrl}`,
        html: html(
          event.exchange
            ? t("We've got your exchange request")
            : t("We've got your return request"),
          paragraph(
            t("{hello} we've received request {number} for:", {
              hello: hi,
              number: b(event.returnNumber),
            }),
          ) +
            `<ul style="margin:0 0 12px;padding-left:20px;color:#444">${event.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` +
            paragraph(escapeHtml(t("We'll review it shortly and tell you how the pickup works."))) +
            viewOrder,
        ),
      };
    case "return_approved":
      return {
        ...base,
        subject: t("Return {number} approved · {shop}", { number: event.returnNumber, shop }),
        text:
          `${t("Your return {number} is approved.", { number: event.returnNumber })}${event.note ? ` ${event.note}` : ""} ${t("Keep the items packed with their tags.")}` +
          `\n${t("View it:")} ${ctx.orderUrl}`,
        html: html(
          t("Your return is approved"),
          paragraph(
            t(
              "{hello} return {number} is approved. Keep the items packed, with their tags and accessories, ready for pickup.",
              { hello: hi, number: b(event.returnNumber) },
            ),
          ) +
            (event.note
              ? paragraph(
                  `<b>${escapeHtml(t("From {shop}:", { shop }))}</b> ${escapeHtml(event.note)}`,
                )
              : "") +
            viewOrder,
        ),
      };
    case "return_rejected":
      return {
        ...base,
        subject: t("About your return {number} · {shop}", { number: event.returnNumber, shop }),
        text: `${t("We couldn't accept return {number}.", { number: event.returnNumber })}${event.note ? ` ${event.note}` : ""} ${t("Reply to this email if you have questions.")}`,
        html: html(
          t("We couldn't accept this return"),
          paragraph(
            t("{hello} we're sorry, but we couldn't accept return {number}.", {
              hello: hi,
              number: b(event.returnNumber),
            }),
          ) +
            (event.note
              ? paragraph(`<b>${escapeHtml(t("Why:"))}</b> ${escapeHtml(event.note)}`)
              : "") +
            paragraph(escapeHtml(t("Reply to this email if you'd like to talk it through."))) +
            viewOrder,
        ),
      };
    case "return_received": {
      const amount = formatMoney(event.refundAmount, ctx.currency);
      const next = event.exchange
        ? escapeHtml(t("Your replacement will be on its way shortly."))
        : event.refundAmount > 0
          ? t("Your refund of {amount} is being processed.", { amount: b(amount) })
          : escapeHtml(t("There's nothing to pay or refund."));
      return {
        ...base,
        subject: t("We've received your return {number} · {shop}", {
          number: event.returnNumber,
          shop,
        }),
        text: `${t("We've received return {number}.", { number: event.returnNumber })} ${next
          .replace(/<[^>]+>/g, "")
          .replace(/&#39;/g, "'")
          .replace(
            /&amp;/g,
            "&",
          )}${event.creditNoteUrl ? `\n${t("Credit note:")} ${event.creditNoteUrl}` : ""}`,
        html: html(
          t("We've received your return"),
          paragraph(
            `${t("{hello} return {number} is back with us.", { hello: hi, number: b(event.returnNumber) })} ${next}`,
          ) +
            (event.creditNoteUrl
              ? button(event.creditNoteUrl, t("View your credit note"))
              : viewOrder),
        ),
      };
    }
    case "return_refunded": {
      const amount = formatMoney(event.amount, ctx.currency);
      const method = t(event.method);
      return {
        ...base,
        subject: t("Refund of {amount} sent · {shop}", { amount, shop }),
        text: t(
          "We've refunded {amount} for return {number} ({method}). Banks can take 5–7 working days to show it.",
          { amount, number: event.returnNumber, method },
        ),
        html: html(
          t("Refund of {amount} sent", { amount }),
          paragraph(
            t("{hello} we've refunded {amount} for return {number} by {method}.", {
              hello: hi,
              amount: b(amount),
              number: b(event.returnNumber),
              method: escapeHtml(method),
            }),
          ) +
            paragraph(
              escapeHtml(
                t("Banks can take 5–7 working days to show refunds to cards and accounts."),
              ),
            ) +
            viewOrder,
        ),
      };
    }
  }
}
