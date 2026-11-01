import { z } from "zod";

import { slugSchema } from "@/features/organizations/schemas";

export const REMINDER_DELAYS = [1, 3, 6, 12, 24] as const;

export const cartReminderSettingsSchema = z.object({
  organizationSlug: slugSchema,
  shopId: z.uuid(),
  enabled: z.boolean(),
  delayHours: z.coerce
    .number()
    .refine((n) => (REMINDER_DELAYS as readonly number[]).includes(n), "Choose a delay"),
  code: z
    .string()
    .trim()
    .max(32)
    .refine((v) => v === "" || /^[A-Za-z0-9_-]{3,32}$/.test(v), "Codes are 3–32 letters or digits")
    .optional()
    .default(""),
});
export type CartReminderSettingsInput = z.input<typeof cartReminderSettingsSchema>;

export const CART_STATUS_LABELS = {
  open: "In progress",
  reminded: "Reminded",
  recovered: "Recovered",
  closed: "Closed",
} as const;
