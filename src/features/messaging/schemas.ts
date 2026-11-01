import { z } from "zod";

import { MESSAGE_EVENT_IDS } from "@/features/messaging/templates";
import { slugSchema } from "@/features/organizations/schemas";

export const PROVIDERS = {
  off: "Off",
  test: "Test outbox (nothing is sent; messages appear in the log below)",
  twilio: "Twilio (SMS, or WhatsApp through Twilio's sandbox or an approved sender)",
} as const;
export type ProviderChoice = keyof typeof PROVIDERS;

const e164 = /^\+[1-9][0-9]{6,14}$/;

export const messagingSettingsSchema = z
  .object({
    organizationSlug: slugSchema,
    provider: z.enum(["off", "test", "twilio"]),
    channel: z.enum(["whatsapp", "sms"]),
    accountSid: z.string().trim().optional().default(""),
    /** Blank keeps the saved token. */
    authToken: z.string().trim().max(200).optional().default(""),
    sender: z.string().trim().optional().default(""),
    events: z
      .array(z.enum(MESSAGE_EVENT_IDS as [string, ...string[]]))
      .max(MESSAGE_EVENT_IDS.length),
    enabled: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.provider !== "twilio") return;
    if (!/^AC[0-9a-fA-F]{32}$/.test(v.accountSid))
      ctx.addIssue({
        code: "custom",
        path: ["accountSid"],
        message: "Starts with AC, 34 characters",
      });
    if (!e164.test(v.sender))
      ctx.addIssue({
        code: "custom",
        path: ["sender"],
        message: "Your Twilio number with country code, like +14155238886",
      });
  });
export type MessagingSettingsInput = z.input<typeof messagingSettingsSchema>;

export const testMessageSchema = z.object({
  organizationSlug: slugSchema,
  phone: z.string().trim().min(6, "Enter a mobile number").max(20),
});

export const messagingSettingsViewSchema = z.union([
  z.object({ connected: z.literal(false) }),
  z.object({
    connected: z.literal(true),
    provider: z.enum(["test", "twilio"]),
    channel: z.enum(["whatsapp", "sms"]),
    account_sid: z.string().nullable(),
    sender: z.string().nullable(),
    token_saved: z.boolean(),
    events: z.array(z.string()),
    enabled: z.boolean(),
  }),
]);
export type MessagingSettingsView = z.output<typeof messagingSettingsViewSchema>;
