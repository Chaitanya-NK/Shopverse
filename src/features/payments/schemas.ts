import { z } from "zod";

import { slugSchema } from "@/features/organizations/schemas";

/** Secret or restricted key: sk_test_…, sk_live_…, rk_test_…, rk_live_… */
const SECRET_KEY = /^(sk|rk)_(test|live)_[A-Za-z0-9]{10,247}$/;
const WEBHOOK_SECRET = /^whsec_[A-Za-z0-9+/=]{10,200}$/;

export const paymentSettingsSchema = z.object({
  organizationSlug: slugSchema,
  /** Blank keeps the saved key (when already connected). */
  secretKey: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || SECRET_KEY.test(v),
      "Paste the secret key from Stripe (it starts with sk_test_ or sk_live_)",
    )
    .optional()
    .default(""),
  /** Blank keeps the saved signing secret. */
  webhookSecret: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || WEBHOOK_SECRET.test(v),
      "Paste the signing secret from Stripe (it starts with whsec_)",
    )
    .optional()
    .default(""),
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
