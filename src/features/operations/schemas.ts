import { z } from "zod";

import { slugSchema } from "@/features/organizations/schemas";

export const RECIPIENT_ROLES = ["owner", "admin", "manager", "staff", "support"] as const;
export const ROLE_LABELS: Record<(typeof RECIPIENT_ROLES)[number], string> = {
  owner: "Owners",
  admin: "Admins",
  manager: "Managers",
  staff: "Staff",
  support: "Support",
};
export const COURIER_CHOICES = {
  none: "No courier: I'll enter tracking numbers myself",
  test: "Shopverse Test Courier (simulated, no real pickups)",
} as const;

export const operationsSettingsSchema = z.object({
  organizationSlug: slugSchema,
  lowStockAlerts: z.boolean(),
  dailyDigest: z.boolean(),
  digestHour: z.coerce.number().int().min(0).max(23),
  recipientRoles: z
    .array(z.enum(RECIPIENT_ROLES))
    .min(1, "Choose who gets the emails")
    .max(RECIPIENT_ROLES.length),
  courier: z.enum(["none", "test"]),
});
export type OperationsSettingsInput = z.input<typeof operationsSettingsSchema>;

/** "8" -> "8:00 am" (India time). */
export function hourLabel(hour: number) {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:00 ${hour < 12 ? "am" : "pm"}`;
}
