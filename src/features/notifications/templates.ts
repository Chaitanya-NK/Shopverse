import { formatMoney } from "@/lib/format";
import { escapeHtml } from "@/lib/html";
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

function button(href: string, label: string) {
  return `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="background:${BRAND};color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;display:inline-block;font-weight:600">${escapeHtml(label)}</a></p>`;
}

function paragraph(text: string) {
  return `<p style="margin:0 0 12px;color:#444;line-height:1.5">${text}</p>`;
}

function itemsTable(ctx: OrderEmailContext) {
  const rows = ctx.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0;color:#333">${i.quantity} × ${escapeHtml(i.title)}</td><td style="padding:6px 0;text-align:right;color:#333;white-space:nowrap">${escapeHtml(formatMoney(i.total, ctx.currency))}</td></tr>`,
    )
    .join("");
  const discount =
    ctx.discount && ctx.discount.amount > 0
      ? `<tr><td style="padding:6px 0;color:#15803d">Discount${ctx.discount.code ? ` (${escapeHtml(ctx.discount.code)})` : ""}</td><td style="padding:6px 0;text-align:right;color:#15803d;white-space:nowrap">−${escapeHtml(formatMoney(ctx.discount.amount, ctx.currency))}</td></tr>`
      : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;border-bottom:1px solid #eee;margin:16px 0;font-size:14px">${rows}${discount}
<tr><td style="padding:6px 0;color:#333">Delivery</td><td style="padding:6px 0;text-align:right;color:#333;white-space:nowrap">${ctx.shipping > 0 ? escapeHtml(formatMoney(ctx.shipping, ctx.currency)) : "Free"}</td></tr>
<tr><td style="padding:10px 0;font-weight:700">Total</td><td style="padding:10px 0;text-align:right;font-weight:700">${escapeHtml(formatMoney(ctx.total, ctx.currency))}</td></tr></table>`;
}

function layout(ctx: OrderEmailContext, title: string, body: string) {
  const contact = [ctx.supportEmail, ctx.supportPhone]
    .filter(Boolean)
    .map((c) => escapeHtml(c!))
    .join(" · ");
  return `<!doctype html>
<html><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:16px;padding:32px" cellpadding="0" cellspacing="0"><tr><td>
<p style="margin:0 0 20px;font-weight:700;color:${BRAND}">${escapeHtml(ctx.shopName)}</p>
<h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(title)}</h1>
${body}
<p style="margin:24px 0 0;color:#888;font-size:12px">Order ${escapeHtml(ctx.orderNumber)}${contact ? ` · Questions? ${contact}` : ""}</p>
</td></tr></table>
<p style="color:#999;font-size:12px;margin-top:16px">Sent by Shopverse on behalf of ${escapeHtml(ctx.shopName)}.</p>
</td></tr></table></body></html>`;
}

const hello = (ctx: OrderEmailContext) =>
  ctx.customerName ? `Hi ${escapeHtml(ctx.customerName.split(" ")[0]!)},` : "Hello,";

/** Subject, text and HTML for one order event. */
export function orderEventEmail(ctx: OrderEmailContext, event: OrderEmailEvent): Mail {
  const total = formatMoney(ctx.total, ctx.currency);
  const shop = ctx.shopName;
  const base = { to: ctx.to, replyTo: ctx.supportEmail };

  switch (event.type) {
    case "confirmed":
      return {
        ...base,
        subject: `Order ${ctx.orderNumber} confirmed · ${shop}`,
        text: `Thanks for your order! ${ctx.orderNumber} (${total}${ctx.cashOnDelivery ? ", cash on delivery" : ""}) is confirmed.\nView it: ${ctx.orderUrl}`,
        html: layout(
          ctx,
          "Thanks for your order!",
          paragraph(`${hello(ctx)} we've received your order and are getting it ready.`) +
            itemsTable(ctx) +
            (ctx.cashOnDelivery
              ? paragraph(
                  "Pay in cash or UPI when it arrives. We'll email a delivery code when it's out for delivery.",
                )
              : "") +
            button(ctx.orderUrl, "View your order"),
        ),
      };
    case "shipped": {
      const via = event.carrier
        ? ` with ${escapeHtml(event.carrier)}${event.trackingNumber ? ` (tracking number ${escapeHtml(event.trackingNumber)})` : ""}`
        : "";
      return {
        ...base,
        subject: `Your ${shop} order is on its way`,
        text: `Good news: order ${ctx.orderNumber} has shipped (parcel ${event.shipmentNumber}).\nTrack it: ${event.trackingUrl}`,
        html: layout(
          ctx,
          "Your order is on its way",
          paragraph(
            `${hello(ctx)} parcel <b>${escapeHtml(event.shipmentNumber)}</b> has left our warehouse${via}.`,
          ) +
            button(event.trackingUrl, "Track your parcel") +
            (ctx.invoiceUrl
              ? paragraph(
                  `Your invoice is ready: <a href="${escapeHtml(ctx.invoiceUrl)}" style="color:${BRAND}">view or download it</a>.`,
                )
              : ""),
        ),
      };
    }
    case "out_for_delivery":
      return {
        ...base,
        subject: `${event.otp} is your delivery code · ${shop}`,
        text:
          `Your ${shop} order is out for delivery today.\n` +
          `Your delivery code is ${event.otp}. Share it with the courier only after you have your parcel.\n` +
          (ctx.cashOnDelivery ? `Please keep ${total} ready (cash or UPI).\n` : "") +
          `Track it: ${event.trackingUrl}`,
        html: layout(
          ctx,
          "Out for delivery today",
          paragraph(
            `${hello(ctx)} parcel <b>${escapeHtml(event.shipmentNumber)}</b> will reach you today. Your delivery code:`,
          ) +
            `<p style="font-size:34px;letter-spacing:8px;font-weight:700;margin:8px 0 16px;font-family:monospace">${escapeHtml(event.otp)}</p>` +
            paragraph(
              "Share it with the courier <b>only after</b> you have your parcel. Nobody from the shop will ask for it on the phone.",
            ) +
            (ctx.cashOnDelivery
              ? paragraph(`Please keep <b>${escapeHtml(total)}</b> ready in cash or UPI.`)
              : "") +
            button(event.trackingUrl, "Track your parcel"),
        ),
      };
    case "delivery_failed":
      return {
        ...base,
        subject: `We missed you · ${shop} order ${ctx.orderNumber}`,
        text: `We couldn't deliver parcel ${event.shipmentNumber} today. We'll try again; your new delivery code will come by email.\nTrack it: ${event.trackingUrl}`,
        html: layout(
          ctx,
          "We couldn't deliver today",
          paragraph(
            `${hello(ctx)} the courier couldn't deliver parcel <b>${escapeHtml(event.shipmentNumber)}</b>. We'll try again soon and email you a new delivery code.`,
          ) +
            paragraph("If you'd like to change the time or address, reply to this email.") +
            button(event.trackingUrl, "Track your parcel"),
        ),
      };
    case "delivered":
      return {
        ...base,
        subject: `Delivered: your ${shop} order`,
        text: `Parcel ${event.shipmentNumber} of order ${ctx.orderNumber} was delivered. Thank you for shopping with ${shop}!${ctx.invoiceUrl ? `\nInvoice: ${ctx.invoiceUrl}` : ""}`,
        html: layout(
          ctx,
          "Delivered. Enjoy!",
          paragraph(
            `${hello(ctx)} parcel <b>${escapeHtml(event.shipmentNumber)}</b> has been delivered. Thank you for shopping with ${escapeHtml(shop)}.`,
          ) +
            (ctx.invoiceUrl
              ? button(ctx.invoiceUrl, "Download your invoice")
              : button(ctx.orderUrl, "View your order")) +
            paragraph("Something not right? Reply to this email and we'll help."),
        ),
      };
    case "cancelled":
      return {
        ...base,
        subject: `Order ${ctx.orderNumber} cancelled · ${shop}`,
        text: event.byCustomer
          ? `As you asked, order ${ctx.orderNumber} has been cancelled. Nothing more to do.`
          : `We're sorry: order ${ctx.orderNumber} has been cancelled by ${shop}. Reply to this email if you have questions.`,
        html: layout(
          ctx,
          "Your order is cancelled",
          paragraph(
            event.byCustomer
              ? `${hello(ctx)} as you asked, we've cancelled order <b>${escapeHtml(ctx.orderNumber)}</b>.`
              : `${hello(ctx)} we're sorry, but ${escapeHtml(shop)} had to cancel order <b>${escapeHtml(ctx.orderNumber)}</b>.`,
          ) +
            paragraph(
              ctx.cashOnDelivery
                ? "It was cash on delivery, so there's nothing to pay or refund."
                : "If you paid, the refund will follow.",
            ) +
            button(ctx.orderUrl, "View order"),
        ),
      };
    case "return_requested":
      return {
        ...base,
        subject: `Return ${event.returnNumber} requested · ${shop}`,
        text: `We've got your ${event.exchange ? "exchange" : "return"} request ${event.returnNumber} for order ${ctx.orderNumber}. We'll let you know once it's reviewed.\nView it: ${ctx.orderUrl}`,
        html: layout(
          ctx,
          event.exchange ? "We've got your exchange request" : "We've got your return request",
          paragraph(
            `${hello(ctx)} we've received request <b>${escapeHtml(event.returnNumber)}</b> for:`,
          ) +
            `<ul style="margin:0 0 12px;padding-left:20px;color:#444">${event.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` +
            paragraph("We'll review it shortly and tell you how the pickup works.") +
            button(ctx.orderUrl, "View your order"),
        ),
      };
    case "return_approved":
      return {
        ...base,
        subject: `Return ${event.returnNumber} approved · ${shop}`,
        text: `Your return ${event.returnNumber} is approved.${event.note ? ` ${event.note}` : ""} Keep the items packed with their tags.\nView it: ${ctx.orderUrl}`,
        html: layout(
          ctx,
          "Your return is approved",
          paragraph(
            `${hello(ctx)} return <b>${escapeHtml(event.returnNumber)}</b> is approved. Keep the items packed, with their tags and accessories, ready for pickup.`,
          ) +
            (event.note
              ? paragraph(`<b>From ${escapeHtml(shop)}:</b> ${escapeHtml(event.note)}`)
              : "") +
            button(ctx.orderUrl, "View your order"),
        ),
      };
    case "return_rejected":
      return {
        ...base,
        subject: `About your return ${event.returnNumber} · ${shop}`,
        text: `We couldn't accept return ${event.returnNumber}.${event.note ? ` ${event.note}` : ""} Reply to this email if you have questions.`,
        html: layout(
          ctx,
          "We couldn't accept this return",
          paragraph(
            `${hello(ctx)} we're sorry, but we couldn't accept return <b>${escapeHtml(event.returnNumber)}</b>.`,
          ) +
            (event.note ? paragraph(`<b>Why:</b> ${escapeHtml(event.note)}`) : "") +
            paragraph("Reply to this email if you'd like to talk it through.") +
            button(ctx.orderUrl, "View your order"),
        ),
      };
    case "return_received": {
      const amount = formatMoney(event.refundAmount, ctx.currency);
      const next = event.exchange
        ? "Your replacement will be on its way shortly."
        : event.refundAmount > 0
          ? `Your refund of <b>${escapeHtml(amount)}</b> is being processed.`
          : "There's nothing to pay or refund.";
      return {
        ...base,
        subject: `We've received your return ${event.returnNumber} · ${shop}`,
        text: `We've received return ${event.returnNumber}. ${next.replace(/<[^>]+>/g, "")}${event.creditNoteUrl ? `\nCredit note: ${event.creditNoteUrl}` : ""}`,
        html: layout(
          ctx,
          "We've received your return",
          paragraph(
            `${hello(ctx)} return <b>${escapeHtml(event.returnNumber)}</b> is back with us. ${next}`,
          ) +
            (event.creditNoteUrl
              ? button(event.creditNoteUrl, "View your credit note")
              : button(ctx.orderUrl, "View your order")),
        ),
      };
    }
    case "return_refunded": {
      const amount = formatMoney(event.amount, ctx.currency);
      return {
        ...base,
        subject: `Refund of ${amount} sent · ${shop}`,
        text: `We've refunded ${amount} for return ${event.returnNumber} (${event.method}). Banks can take 5–7 working days to show it.`,
        html: layout(
          ctx,
          `Refund of ${amount} sent`,
          paragraph(
            `${hello(ctx)} we've refunded <b>${escapeHtml(amount)}</b> for return <b>${escapeHtml(event.returnNumber)}</b> by ${escapeHtml(event.method)}.`,
          ) +
            paragraph("Banks can take 5–7 working days to show refunds to cards and accounts.") +
            button(ctx.orderUrl, "View your order"),
        ),
      };
    }
  }
}
