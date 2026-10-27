import "server-only";

import { getPendingEmail, maskEmail } from "./internal/pending-email";

/** Data for the verify screen. Only a masked address ever reaches the client. */
export async function getPendingVerification(): Promise<{ maskedEmail: string } | null> {
  const email = await getPendingEmail();
  return email ? { maskedEmail: maskEmail(email) } : null;
}
