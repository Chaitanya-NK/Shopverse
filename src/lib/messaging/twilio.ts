import "server-only";

import { env } from "@/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Twilio's Messages API for SMS and WhatsApp. WhatsApp numbers are written
 * "whatsapp:+91…" on both ends. Trial accounts and the WhatsApp sandbox work
 * for testing without any business verification.
 */
export type TwilioCredentials = { accountSid: string; authToken: string };
export type Channel = "sms" | "whatsapp";

const address = (channel: Channel, phone: string) =>
  channel === "whatsapp" ? `whatsapp:${phone}` : phone;

async function call<T>(
  c: TwilioCredentials,
  method: "GET" | "POST",
  path: string,
  form?: Record<string, string>,
) {
  let response: Response;
  try {
    response = await fetch(
      `${env.TWILIO_API_URL}/2010-04-01/Accounts/${encodeURIComponent(c.accountSid)}${path}`,
      {
        method,
        headers: {
          authorization: `Basic ${Buffer.from(`${c.accountSid}:${c.authToken}`).toString("base64")}`,
          ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
        },
        body: form ? new URLSearchParams(form).toString() : undefined,
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      },
    );
  } catch (cause) {
    logger.warn({ err: cause, path }, "Twilio unreachable");
    throw new AppError("UNAVAILABLE", "The messaging service didn't respond.", { cause });
  }
  const data = (await response.json().catch(() => ({}))) as { message?: string; code?: number };
  if (!response.ok) {
    if (response.status === 401)
      throw new AppError("VALIDATION", "Twilio didn't accept this Account SID and auth token.");
    throw new AppError("UNAVAILABLE", data.message ?? "The messaging service returned an error.");
  }
  return data as T;
}

export const twilio = {
  checkCredentials: (c: TwilioCredentials) =>
    call<{ sid: string; status: string }>(c, "GET", ".json"),
  send: (
    c: TwilioCredentials,
    input: { channel: Channel; from: string; to: string; body: string },
  ) =>
    call<{ sid: string; status: string }>(c, "POST", "/Messages.json", {
      From: address(input.channel, input.from),
      To: address(input.channel, input.to),
      Body: input.body,
    }),
};
