import { type Enums } from "@/types/database.types";

export type OrgRole = Enums<"org_role">;

/**
 * UI-level capability map. It decides what to *show*; Postgres RLS decides
 * what is *allowed*. Keep the two in sync when policies change.
 */
const CAPABILITIES = {
  "organization.update": ["owner", "admin"],
  "organization.billing": ["owner"],
  "members.manage": ["owner", "admin"],
  "shops.create": ["owner", "admin"],
  "shops.update": ["owner", "admin"],
  "shops.delete": ["owner"],
  "warehouses.manage": ["owner", "admin", "manager"],
  "catalog.manage": ["owner", "admin", "manager"],
  "inventory.adjust": ["owner", "admin", "manager", "staff"],
  "orders.manage": ["owner", "admin", "manager", "staff"],
  "orders.cancel": ["owner", "admin", "manager"],
  "audit.read": ["owner", "admin"],
  "payments.manage": ["owner", "admin"],
  // Sales figures, GST reports and CSV exports.
  "analytics.read": ["owner", "admin", "manager"],
} as const satisfies Record<string, readonly OrgRole[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: OrgRole | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return (CAPABILITIES[capability] as readonly OrgRole[]).includes(role);
}

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Shop manager",
  staff: "Staff",
  support: "Support",
};
