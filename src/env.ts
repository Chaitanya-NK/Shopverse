import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Typed, validated environment variables.
 * Import `env` instead of reading `process.env` anywhere in the app.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    // Server-only. Used for storefront checkout (it handles one-time codes) and
    // future trusted jobs. Never exposed to the browser.
    SUPABASE_SECRET_KEY: z.string().min(1).optional(),
    // Transactional email (checkout codes, order confirmations). Any SMTP
    // provider works, e.g. Brevo: smtp-relay.brevo.com:587.
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    MAIL_FROM: z.string().min(3).optional(),
    // Encrypts each business's payment secrets before they are stored:
    // 32 random bytes, base64 (openssl rand -base64 32). Keep it secret; if it
    // changes, businesses must re-enter their Stripe keys.
    PAYMENTS_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, "base64").length === 32, "Must be 32 bytes, base64-encoded")
      .optional(),
    // Override only for local testing against a stand-in.
    STRIPE_API_URL: z.url().default("https://api.stripe.com"),
    // Shopverse's own Stripe account, for plan subscriptions (not the
    // businesses' accounts). Without the key, plans are changed by request.
    PLATFORM_STRIPE_SECRET_KEY: z
      .string()
      .regex(/^(sk|rk)_(test|live)_[A-Za-z0-9]{10,247}$/, "Must be a Stripe secret key")
      .optional(),
    PLATFORM_STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
    // Printed on Shopverse's invoices to businesses. With a GSTIN, plan prices
    // get GST added and invoices are tax invoices.
    PLATFORM_LEGAL_NAME: z.string().min(2).default("Shopverse"),
    PLATFORM_GSTIN: z
      .string()
      .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Must be a valid GSTIN")
      .optional(),
    PLATFORM_ADDRESS: z.string().optional(),
    PLATFORM_CITY: z.string().optional(),
    PLATFORM_STATE: z.string().optional(),
    PLATFORM_POSTAL_CODE: z.string().optional(),
    PLATFORM_GST_RATE: z.coerce.number().min(0).max(28).default(18),
    // SAC for software subscriptions; confirm with your accountant.
    PLATFORM_SAC_CODE: z.string().default("997331"),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  skipValidation: Boolean(process.env.SKIP_ENV_VALIDATION),
  emptyStringAsUndefined: true,
});
