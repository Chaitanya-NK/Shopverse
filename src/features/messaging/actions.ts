"use server";

import { refresh } from "next/cache";

import { messagingSettingsSchema, testMessageSchema } from "@/features/messaging/schemas";
import { sendMessage } from "@/features/messaging/server";
import { authorizeOrganization } from "@/features/organizations/server";
import { createAction } from "@/lib/actions/create-action";
import { Errors, fromPostgrestError } from "@/lib/errors";
import { toE164 } from "@/lib/messaging/phone";
import { twilio } from "@/lib/messaging/twilio";
import { decryptSecret, encryptSecret } from "@/lib/payments/secrets";
import { createAdminClient } from "@/lib/supabase/admin";

const FORBIDDEN = "Only owners and admins can change messaging.";

export const saveMessagingSettings = createAction({
  name: "messaging.save",
  schema: messagingSettingsSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "payments.manage",
      FORBIDDEN,
    );
    if (input.provider === "off") {
      const { error } = await supabase.rpc("disconnect_messaging", { p_organization_id: org.id });
      if (error) throw fromPostgrestError(error);
      refresh();
      return null;
    }

    let tokenEnc: string | undefined;
    if (input.provider === "twilio") {
      let token = input.authToken;
      if (!token) {
        const { data } = await createAdminClient().rpc("messaging_account", {
          p_organization_id: org.id,
        });
        const saved = (data as { auth_token_enc?: string | null } | null)?.auth_token_enc;
        if (!saved) throw Errors.validation({ authToken: ["Enter the auth token"] });
        token = decryptSecret(saved);
      } else {
        tokenEnc = encryptSecret(token);
      }
      // Check the keys before saving them.
      await twilio.checkCredentials({ accountSid: input.accountSid, authToken: token });
    }

    const { error } = await supabase.rpc("save_messaging_settings", {
      p_organization_id: org.id,
      p_provider: input.provider,
      p_channel: input.channel,
      p_events: input.events,
      p_enabled: input.enabled,
      p_account_sid: input.provider === "twilio" ? input.accountSid : undefined,
      p_auth_token_enc: tokenEnc,
      p_sender: input.provider === "twilio" ? input.sender : undefined,
    });
    if (error) throw fromPostgrestError(error);
    refresh();
    return null;
  },
});

export const sendTestMessage = createAction({
  name: "messaging.test",
  schema: testMessageSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "payments.manage",
      FORBIDDEN,
    );
    const to = toE164(input.phone);
    if (!to) throw Errors.validation({ phone: ["Enter a mobile number, like 98765 43210"] });
    const result = await sendMessage({
      organizationId: org.id,
      orderId: null,
      event: "test",
      to,
      body: "This is a test message from Shopverse. Your customers' order updates will arrive like this.",
    });
    refresh();
    if (!result.ok) throw Errors.validation({}, result.error ?? "The message wasn't sent.");
    return { to };
  },
});
