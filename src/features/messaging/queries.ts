import "server-only";

import { cache } from "react";

import { messagingSettingsViewSchema } from "@/features/messaging/schemas";
import { fromPostgrestError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export const getMessagingSettings = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_messaging_settings", {
    p_organization_id: organizationId,
  });
  if (error) throw fromPostgrestError(error);
  return messagingSettingsViewSchema.parse(data);
});

export type LoggedMessage = {
  id: string;
  channel: string;
  provider: string;
  event: string;
  toPhone: string;
  body: string;
  status: "sent" | "failed";
  error: string | null;
  createdAt: string;
  orderId: string | null;
};

export const listMessages = cache(async (organizationId: string): Promise<LoggedMessage[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_log")
    .select("id, channel, provider, event, to_phone, body, status, error, created_at, order_id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw fromPostgrestError(error);
  return data.map((m) => ({
    id: m.id,
    channel: m.channel,
    provider: m.provider,
    event: m.event,
    toPhone: m.to_phone,
    body: m.body,
    status: m.status as LoggedMessage["status"],
    error: m.error,
    createdAt: m.created_at,
    orderId: m.order_id,
  }));
});
