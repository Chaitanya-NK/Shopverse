import "server-only";

import { type Mail, escapeHtml } from "@/lib/mail";
import { formatMoney } from "@/lib/format";

const wrap = (title: string, body: string) => `<!doctype html>
<html><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:16px;padding:32px" cellpadding="0" cellspacing="0">
<tr><td><h1 style="margin:0 0 16px;font-size:20px">${title}</h1>${body}</td></tr></table>
<p style="color:#888;font-size:12px;margin-top:16px">Sent by Shopverse on behalf of the shop.</p>
</td></tr></table></body></html>`;

export function checkoutCodeEmail(input: {
  to: string;
  shopName: string;
  code: string;
  /** Omitted on resends. */
  total?: number;
  currency: string;
}): Mail {
  const shop = escapeHtml(input.shopName);
  const amount = input.total !== undefined ? formatMoney(input.total, input.currency) : null;
  return {
    to: input.to,
    subject: `${input.code} is your ${input.shopName} order code`,
    text:
      `Your code to confirm your ${input.shopName} order${amount ? ` of ${amount}` : ""} is ${input.code}.\n` +
      `It expires in 10 minutes. If you didn't try to order, ignore this email.`,
    html: wrap(
      `Confirm your order at ${shop}`,
      `<p style="margin:0 0 16px;color:#444">Enter this code to place your cash-on-delivery order${
        amount ? ` of <b>${escapeHtml(amount)}</b>` : ""
      }.</p>
       <p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:0 0 16px;font-family:monospace">${input.code}</p>
       <p style="margin:0;color:#666;font-size:13px">It expires in 10 minutes. If you didn't try to order, ignore this email.</p>`,
    ),
  };
}

export function orderConfirmationEmail(input: {
  to: string;
  shopName: string;
  orderNumber: string;
  total: number;
  currency: string;
  orderUrl: string;
  replyTo: string | null;
}): Mail {
  const total = formatMoney(input.total, input.currency);
  return {
    to: input.to,
    replyTo: input.replyTo,
    subject: `Order ${input.orderNumber} confirmed · ${input.shopName}`,
    text:
      `Thanks for your order! ${input.orderNumber} (${total}, cash on delivery) is confirmed.\n` +
      `Follow it here: ${input.orderUrl}\n` +
      `When it's out for delivery we'll share a delivery code. Give it to the courier only when you have your parcel.`,
    html: wrap(
      `Thanks for your order!`,
      `<p style="margin:0 0 8px;color:#444">Order <b>${escapeHtml(input.orderNumber)}</b> at ${escapeHtml(
        input.shopName,
      )} is confirmed.</p>
       <p style="margin:0 0 20px;color:#444">Total <b>${escapeHtml(total)}</b>, paid in cash on delivery.</p>
       <p style="margin:0 0 20px"><a href="${escapeHtml(input.orderUrl)}" style="background:#1d6b5c;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;display:inline-block">View your order</a></p>
       <p style="margin:0;color:#666;font-size:13px">When it's out for delivery you'll get a delivery code. Share it with the courier only once you have your parcel.</p>`,
    ),
  };
}

export function signInCodeEmail(input: { to: string; shopName: string; code: string }): Mail {
  const shop = escapeHtml(input.shopName);
  return {
    to: input.to,
    subject: `${input.code} is your ${input.shopName} sign-in code`,
    text:
      `Your code to sign in to ${input.shopName} is ${input.code}.\n` +
      `It expires in 10 minutes. If you didn't ask for it, you can ignore this email.`,
    html: wrap(
      `Sign in to ${shop}`,
      `<p style="margin:0 0 16px;color:#444">Enter this code to sign in to your account.</p>
       <p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:0 0 16px;font-family:monospace">${input.code}</p>
       <p style="margin:0;color:#666;font-size:13px">It expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p>`,
    ),
  };
}
