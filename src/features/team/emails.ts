import "server-only";

import { ROLE_LABELS, type OrgRole } from "@/features/organizations/permissions";
import { escapeHtml, type Mail } from "@/lib/mail";

export function invitationEmail(input: {
  to: string;
  organizationName: string;
  inviterName: string;
  role: OrgRole;
  link: string;
}): Mail {
  const role = ROLE_LABELS[input.role];
  return {
    to: input.to,
    subject: `${input.inviterName} invited you to ${input.organizationName} on Shopverse`,
    text:
      `${input.inviterName} invited you to join ${input.organizationName} on Shopverse as ${role}.\n\n` +
      `Accept the invitation: ${input.link}\n\nThe link works once and expires in 7 days.`,
    html: `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:16px;padding:32px" cellpadding="0" cellspacing="0"><tr><td>
<h1 style="margin:0 0 16px;font-size:20px">Join ${escapeHtml(input.organizationName)}</h1>
<p style="margin:0 0 20px;color:#444">${escapeHtml(input.inviterName)} invited you to join <b>${escapeHtml(
      input.organizationName,
    )}</b> on Shopverse as <b>${escapeHtml(role)}</b>.</p>
<p style="margin:0 0 20px"><a href="${escapeHtml(input.link)}" style="background:#1d6b5c;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;display:inline-block">Accept invitation</a></p>
<p style="margin:0;color:#666;font-size:13px">The link works once and expires in 7 days. Sign in with ${escapeHtml(
      input.to,
    )} to accept it.</p>
</td></tr></table></td></tr></table></body></html>`,
  };
}
