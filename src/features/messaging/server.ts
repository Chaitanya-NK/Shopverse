import "server-only";

import { routes } from "@/config/routes";
import { env } from "@/env";
import { type MessageEvent, messageBody } from "@/features/messaging/templates";
import { formatMoney } from "@/lib/format";
import { isLocale, type Locale } from "@/i18n/core";
import { translator } from "@/i18n/server";
import { openJobSecret } from "@/lib/jobs/queue";
import { logger } from "@/lib/logger";
import { type Channel, twilio } from "@/lib/messaging/twilio";
import { toE164 } from "@/lib/messaging/phone";
import { decryptSecret } from "@/lib/payments/secrets";
import { createAdminClient } from "@/lib/supabase/admin";

const url = (path: string) => new URL(path, env.NEXT_PUBLIC_APP_URL).toString();

type Account = {
  provider: "test" | "twilio";
  channel: Channel;
  account_sid: string | null;
  auth_token_enc: string | null;
  sender: string | null;
  events: string[];
  enabled: boolean;
};

async function account(organizationId: string): Promise<Account | null> {
  const { data, error } = await createAdminClient().rpc("messaging_account", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return (data as Account | null) ?? null;
}

/**
 * Send one message through the business's provider and log it. The test
 * provider only logs (nothing leaves Shopverse). Never throws.
 */
export async function sendMessage(input: {
  organizationId: string;
  orderId: string | null;
  event: string;
  to: string;
  body: string;
  account?: Account;
}): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  let acc: Account | null = input.account ?? null;
  let status: "sent" | "failed" = "sent";
  let providerId: string | null = null;
  let error: string | null = null;
  try {
    acc ??= await account(input.organizationId);
    if (!acc) return { ok: false, error: "Messaging isn't set up" };
    if (acc.provider === "twilio") {
      const sent = await twilio.send(
        { accountSid: acc.account_sid!, authToken: decryptSecret(acc.auth_token_enc!) },
        { channel: acc.channel, from: acc.sender!, to: input.to, body: input.body },
      );
      providerId = sent.sid;
    } else {
      providerId = `test_${crypto.randomUUID().slice(0, 8)}`;
    }
  } catch (cause) {
    status = "failed";
    error = cause instanceof Error ? cause.message : "Sending failed";
    logger.warn({ err: cause, organizationId: input.organizationId }, "Message failed");
  }
  if (acc) {
    const { error: logError } = await admin.rpc("record_message", {
      p_organization_id: input.organizationId,
      // Null for test messages (the generated type doesn't know it's nullable).
      p_order_id: input.orderId as string,
      p_channel: acc.channel,
      p_provider: acc.provider,
      p_event: input.event,
      p_to: input.to,
      p_body: input.body,
      p_status: status,
      p_provider_id: providerId ?? undefined,
      p_error: error ?? undefined,
    });
    if (logError) logger.warn({ err: logError }, "Logging a message failed");
  }
  return status === "sent" ? { ok: true } : { ok: false, error: error ?? "Sending failed" };
}

/**
 * An order update by WhatsApp or SMS, when the business has messaging on for
 * this event and the customer asked for updates on this order. Returns null
 * when nothing needed sending.
 */
export async function sendOrderMessage(
  orderId: string,
  event: MessageEvent,
  extra: { trackingUrl?: string | null; otp?: string | null } = {},
) {
  const { data: order, error } = await createAdminClient()
    .from("orders")
    .select(
      `organization_id, number, locale, public_token, grand_total, currency, message_opt_in, shipping_address,
         shop:shops!orders_organization_id_shop_id_fkey (name, slug, settings),
         customer:customers (full_name, phone)`,
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!order?.message_opt_in || !order.shop) return;
  const acc = await account(order.organization_id);
  if (!acc?.enabled || !acc.events.includes(event)) return;
  const address = (order.shipping_address ?? {}) as Record<string, unknown>;
  const to = toE164(
    order.customer?.phone ?? (typeof address.phone === "string" ? address.phone : null),
  );
  if (!to) return;
  const body = messageBody(
    event,
    {
      shopName: order.shop.name,
      customerName: order.customer?.full_name ?? null,
      orderNumber: order.number,
      total: formatMoney(Number(order.grand_total), order.currency),
      orderUrl: url(routes.storefrontOrder(order.shop.slug, order.public_token)),
      trackingUrl: extra.trackingUrl,
      otp: extra.otp,
    },
    translator(orderLocale(order.locale, order.shop.settings)),
  );
  if (!body) return;
  return await sendMessage({
    organizationId: order.organization_id,
    orderId,
    event,
    to,
    body,
    account: acc,
  });
}

/** order.message job: send, and fail (to retry) when the provider refused. */
export async function runOrderMessageJob(payload: Record<string, unknown>) {
  const orderId = String(payload.orderId ?? "");
  const event = payload.type as MessageEvent;
  const sealed = typeof payload.otp === "string" ? payload.otp : null;
  const result = await sendOrderMessage(orderId, event, {
    trackingUrl: typeof payload.trackingUrl === "string" ? payload.trackingUrl : null,
    otp: sealed ? openJobSecret(sealed) : null,
  });
  if (result && !result.ok && result.error !== "Messaging isn't set up")
    throw new Error(result.error ?? "Sending failed");
}

/** The order's language, else the shop's default. */
function orderLocale(locale: string | null, settings: unknown): Locale {
  if (isLocale(locale)) return locale;
  const language = (settings as Record<string, unknown> | null)?.language;
  return isLocale(language) ? language : "en";
}
