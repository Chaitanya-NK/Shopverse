import { z } from "zod";

import { slugSchema } from "@/features/organizations/schemas";

export const RAZORPAY_KEY_ID = /^rzp_(test|live)_[A-Za-z0-9]{6,40}$/;

export const paymentSettingsSchema = z.object({
  organizationSlug: slugSchema,
  keyId: z
    .string()
    .trim()
    .regex(
      RAZORPAY_KEY_ID,
      "Paste the key id from Razorpay (it starts with rzp_test_ or rzp_live_)",
    ),
  /** Blank keeps the saved secret. */
  keySecret: z.string().trim().max(200).optional().default(""),
  webhookSecret: z.string().trim().max(200).optional().default(""),
  enabled: z.boolean().optional().default(true),
});
export type PaymentSettingsInput = z.input<typeof paymentSettingsSchema>;

export const paymentSettingsViewSchema = z.union([
  z.object({ connected: z.literal(false) }),
  z.object({
    connected: z.literal(true),
    provider: z.string(),
    key_id: z.string(),
    mode: z.enum(["test", "live"]),
    enabled: z.boolean(),
    webhook_configured: z.boolean(),
    updated_at: z.string(),
  }),
]);
export type PaymentSettingsView = z.output<typeof paymentSettingsViewSchema>;

/** Our payments row as shown to staff. */
export const PAYMENT_STATUS_COPY = {
  created: "Started",
  captured: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  partially_refunded: "Partly refunded",
} as const;
