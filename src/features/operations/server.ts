import "server-only";

import { routes } from "@/config/routes";
import { env } from "@/env";
import { digestSchema, type LowStockItem } from "@/features/operations/digest";
import { digestEmail, lowStockEmail } from "@/features/operations/emails";
import { fromPostgrestError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { createAdminClient } from "@/lib/supabase/admin";

const appUrl = (path: string) => new URL(path, env.NEXT_PUBLIC_APP_URL).toString();

type Contacts = { name: string; slug: string; emails: string[] };

async function contactsFor(organizationId: string): Promise<Contacts | null> {
  const { data, error } = await createAdminClient().rpc("operations_contacts", {
    p_organization_id: organizationId,
  });
  if (error) throw fromPostgrestError(error);
  return (data as Contacts | null) ?? null;
}

/**
 * Email every low-stock alert that hasn't gone out yet, one email per
 * business. Alerts are claimed first (so two runs can't send twice) and put
 * back if their email fails. Returns how many businesses were emailed.
 */
export async function sendStockAlerts() {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_stock_alerts");
  if (error) throw fromPostgrestError(error);
  const batches = (data ?? []) as {
    organization_id: string;
    items: (LowStockItem & { alert_id: string })[];
  }[];
  let sent = 0;
  for (const batch of batches) {
    try {
      const contacts = await contactsFor(batch.organization_id);
      if (!contacts || contacts.emails.length === 0) continue;
      for (const to of contacts.emails)
        await sendMail(
          lowStockEmail({
            to,
            businessName: contacts.name,
            items: batch.items,
            purchasingUrl: appUrl(routes.orgPurchasing(contacts.slug)),
          }),
        );
      sent += 1;
    } catch (cause) {
      logger.warn(
        { err: cause, organizationId: batch.organization_id },
        "Stock alert email failed",
      );
      await admin.rpc("release_stock_alerts", {
        p_alert_ids: batch.items.map((i) => i.alert_id),
      });
    }
  }
  return sent;
}

async function buildDigest(organizationId: string, now: Date) {
  const { data, error } = await createAdminClient().rpc("service_operations_digest", {
    p_organization_id: organizationId,
    p_now: now.toISOString(),
  });
  if (error) throw fromPostgrestError(error);
  return digestSchema.parse(data);
}

/** Send the daily digest to businesses whose hour has come (India time). */
export async function sendDueDigests(now = new Date()) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_due_digests", { p_now: now.toISOString() });
  if (error) throw fromPostgrestError(error);
  let sent = 0;
  for (const organizationId of (data ?? []) as string[]) {
    try {
      if (await sendDigest(organizationId, null, now)) sent += 1;
    } catch (cause) {
      logger.warn({ err: cause, organizationId }, "Daily digest failed");
      await admin.rpc("release_digest", { p_organization_id: organizationId });
    }
  }
  return sent;
}

/** One business's digest, to its recipients or (a preview) to one address. */
export async function sendDigest(organizationId: string, onlyTo: string | null, now = new Date()) {
  const contacts = await contactsFor(organizationId);
  if (!contacts) return false;
  const recipients = onlyTo ? [onlyTo] : contacts.emails;
  if (recipients.length === 0) return false;
  const digest = await buildDigest(organizationId, now);
  for (const to of recipients)
    await sendMail(
      digestEmail({
        to,
        businessName: contacts.name,
        digest,
        dashboardUrl: appUrl(routes.org(contacts.slug)),
        purchasingUrl: appUrl(routes.orgPurchasing(contacts.slug)),
      }),
    );
  return true;
}

/** Everything the scheduler runs: alerts first, then any digests now due. */
export async function runOperationsJobs(now = new Date()) {
  const alerts = await sendStockAlerts();
  const digests = await sendDueDigests(now);
  return { alerts, digests };
}

/** Fire-and-forget after stock changes; failures only log (the scheduler retries). */
export async function sendStockAlertsQuietly() {
  try {
    await sendStockAlerts();
  } catch (cause) {
    logger.warn({ err: cause }, "Sending stock alerts failed");
  }
}
