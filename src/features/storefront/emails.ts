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
