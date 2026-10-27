import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

import { env } from "@/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string | null;
};

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD || !env.MAIL_FROM) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });
  return transporter;
}

/**
 * Send a transactional email. Without SMTP settings, development logs the
 * message instead (so checkout can be tried locally); production refuses.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const transport = getTransporter();
  if (!transport) {
    if (env.NODE_ENV !== "production") {
      logger.warn(
        { subject: mail.subject, body: mail.text },
        "SMTP not configured; email not sent (dev only)",
      );
      return;
    }
    throw new AppError(
      "UNAVAILABLE",
      "We couldn't send email right now. Please try again shortly.",
    );
  }
  try {
    await transport.sendMail({
      from: env.MAIL_FROM,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      replyTo: mail.replyTo ?? undefined,
    });
  } catch (cause) {
    logger.error({ err: cause, subject: mail.subject }, "Email delivery failed");
    throw new AppError(
      "UNAVAILABLE",
      "We couldn't send email right now. Please try again shortly.",
      { cause },
    );
  }
}

export { escapeHtml } from "@/lib/html";
