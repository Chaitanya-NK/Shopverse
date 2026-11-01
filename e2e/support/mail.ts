import { expect } from "@playwright/test";

import { MAILPIT_URL } from "./env";

type Summary = { ID: string; Subject: string; Created: string; To: { Address: string }[] };
export type Mail = { subject: string; text: string; html: string };

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${MAILPIT_URL}/api/v1${path}`);
  if (!res.ok) throw new Error(`Mailpit ${path}: ${res.status}`);
  return (await res.json()) as T;
}

/** A timestamp to pass as `since`, so earlier mail to the same address is ignored. */
export const now = () => Date.now() - 1000;

/** Wait for the newest email to `to` whose subject matches, sent after `since`. */
export async function waitForMail(
  to: string,
  subject: RegExp,
  since: number,
  timeout = 30_000,
): Promise<Mail> {
  let found: Summary | undefined;
  await expect
    .poll(
      async () => {
        const { messages } = await api<{ messages: Summary[] }>(
          `/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=50`,
        );
        found = messages.find(
          (m) => subject.test(m.Subject) && new Date(m.Created).getTime() >= since,
        );
        return !!found;
      },
      { timeout, message: `email to ${to} matching ${subject}` },
    )
    .toBe(true);
  const message = await api<{ Subject: string; Text: string; HTML: string }>(
    `/message/${found!.ID}`,
  );
  return { subject: message.Subject, text: message.Text, html: message.HTML };
}

/** The 6-digit code in a code email (subject first, then body). */
export async function waitForCode(to: string, subject: RegExp, since: number): Promise<string> {
  const mail = await waitForMail(to, subject, since);
  const code = (mail.subject.match(/\b\d{6}\b/) ?? mail.text.match(/\b\d{6}\b/))?.[0];
  if (!code) throw new Error(`No code in "${mail.subject}"`);
  return code;
}
