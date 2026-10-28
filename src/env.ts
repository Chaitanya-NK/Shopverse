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
    // changes, businesses must re-enter their Razorpay keys.
    PAYMENTS_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, "base64").length === 32, "Must be 32 bytes, base64-encoded")
      .optional(),
    // Override only for local testing against a stand-in.
    RAZORPAY_API_URL: z.url().default("https://api.razorpay.com"),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
    NEXT_PUBLIC_RAZORPAY_CHECKOUT_URL: z
      .url()
      .default("https://checkout.razorpay.com/v1/checkout.js"),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_RAZORPAY_CHECKOUT_URL: process.env.NEXT_PUBLIC_RAZORPAY_CHECKOUT_URL,
  },
  skipValidation: Boolean(process.env.SKIP_ENV_VALIDATION),
  emptyStringAsUndefined: true,
});
