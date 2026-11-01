import "server-only";

import { makeTranslate, type Translate } from "@/i18n/core";
import { formatMoney } from "@/lib/format";
import { type Mail, escapeHtml } from "@/lib/mail";

const english = makeTranslate("en", null);

const wrap = (t: Translate, title: string, body: string) => `<!doctype html>
<html lang="${t.locale}"><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,'Noto Sans Devanagari',sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:16px;padding:32px" cellpadding="0" cellspacing="0">
<tr><td><h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(title)}</h1>${body}</td></tr></table>
<p style="color:#888;font-size:12px;margin-top:16px">${escapeHtml(t("Sent by Shopverse on behalf of the shop."))}</p>
</td></tr></table></body></html>`;

const codeBlock = (code: string) =>
  `<p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:0 0 16px;font-family:monospace">${escapeHtml(code)}</p>`;

export function checkoutCodeEmail(input: {
  to: string;
  shopName: string;
  code: string;
  /** Omitted on resends. */
  total?: number;
  currency: string;
  t?: Translate;
}): Mail {
  const t = input.t ?? english;
  const amount = input.total !== undefined ? formatMoney(input.total, input.currency) : null;
  const vars = { shop: input.shopName, code: input.code };
  return {
    to: input.to,
    subject: t("{code} is your {shop} order code", vars),
    text:
      (amount
        ? t("Your code to confirm your {shop} order of {amount} is {code}.", { ...vars, amount })
        : t("Your code to confirm your {shop} order is {code}.", vars)) +
      `\n${t("It expires in 10 minutes. If you didn't try to order, ignore this email.")}`,
    html: wrap(
      t,
      t("Confirm your order at {shop}", vars),
      `<p style="margin:0 0 16px;color:#444">${
        amount
          ? t("Enter this code to place your order of {amount}.", {
              amount: `<b>${escapeHtml(amount)}</b>`,
            })
          : escapeHtml(t("Enter this code to place your order."))
      }</p>
       ${codeBlock(input.code)}
       <p style="margin:0;color:#666;font-size:13px">${escapeHtml(t("It expires in 10 minutes. If you didn't try to order, ignore this email."))}</p>`,
    ),
  };
}

export function signInCodeEmail(input: {
  to: string;
  shopName: string;
  code: string;
  t?: Translate;
}): Mail {
  const t = input.t ?? english;
  const vars = { shop: input.shopName, code: input.code };
  return {
    to: input.to,
    subject: t("{code} is your {shop} sign-in code", vars),
    text:
      `${t("Your code to sign in to {shop} is {code}.", vars)}\n` +
      t("It expires in 10 minutes. If you didn't ask for it, you can ignore this email."),
    html: wrap(
      t,
      t("Sign in to {shop}", vars),
      `<p style="margin:0 0 16px;color:#444">${escapeHtml(t("Enter this code to sign in to your account."))}</p>
       ${codeBlock(input.code)}
       <p style="margin:0;color:#666;font-size:13px">${escapeHtml(t("It expires in 10 minutes. If you didn't ask for it, you can ignore this email."))}</p>`,
    ),
  };
}
