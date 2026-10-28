import { z } from "zod";

import { BILLING_INTERVALS } from "@/config/plans";
import { GSTIN_PATTERN, INDIAN_STATES } from "@/features/orders/india";
import { slugSchema } from "@/features/organizations/schemas";

const PAID_PLANS = ["starter", "growth", "scale"] as const;

export const billingProfileSchema = z.object({
  organizationSlug: slugSchema,
  legalName: z.string().trim().min(2, "Enter the business's legal name").max(160),
  email: z.email("Enter a valid email").max(254),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || GSTIN_PATTERN.test(v), "Enter a valid 15-character GSTIN")
    .optional()
    .default(""),
  line1: z.string().trim().max(200).optional().default(""),
  city: z.string().trim().max(80).optional().default(""),
  state: z.enum(INDIAN_STATES, { error: "Choose a state" }),
  postalCode: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[1-9][0-9]{5}$/.test(v), "Enter a 6-digit PIN code")
    .optional()
    .default(""),
});
export type BillingProfileInput = z.input<typeof billingProfileSchema>;

export const choosePlanSchema = z.object({
  organizationSlug: slugSchema,
  plan: z.enum(PAID_PLANS),
  interval: z.enum(BILLING_INTERVALS),
});
export type ChoosePlanInput = z.input<typeof choosePlanSchema>;

export const confirmSubscriptionSchema = z.object({
  organizationSlug: slugSchema,
  subscriptionId: z.string().regex(/^sub_[A-Za-z0-9]+$/),
  paymentId: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  signature: z.string().regex(/^[0-9a-f]{64}$/),
});

export const orgOnlySchema = z.object({ organizationSlug: slugSchema });
