import { z } from "zod";

import { type OrgRole } from "@/features/organizations/permissions";
import { slugSchema } from "@/features/organizations/schemas";

/** Roles that can be given by invitation (owners are promoted after joining). */
export const INVITABLE_ROLES = [
  "admin",
  "manager",
  "staff",
  "support",
] as const satisfies readonly OrgRole[];
export const ASSIGNABLE_ROLES = ["owner", ...INVITABLE_ROLES] as const satisfies readonly OrgRole[];

export const ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  owner: "Everything, including billing and other owners.",
  admin: "Everything except billing and owners: shops, team, settings.",
  manager: "Catalogue, warehouses, stock and orders.",
  staff: "Orders, packing, deliveries and stock counts.",
  support: "Reads orders and customers; updates notes.",
};

/** Owners and admins always see every shop. */
export const roleHasAllShops = (role: OrgRole) => role === "owner" || role === "admin";

const access = {
  allShops: z.boolean(),
  shopIds: z.array(z.uuid()).max(100),
};

function refineAccess(
  value: { allShops: boolean; shopIds: string[]; role: OrgRole },
  ctx: z.RefinementCtx,
) {
  if (!value.allShops && value.shopIds.length === 0 && !roleHasAllShops(value.role)) {
    ctx.addIssue({ code: "custom", path: ["shopIds"], message: "Choose at least one shop" });
  }
}

export const inviteMemberSchema = z
  .object({
    organizationSlug: slugSchema,
    email: z.email("Enter a valid email").max(254),
    role: z.enum(INVITABLE_ROLES),
    ...access,
  })
  .superRefine(refineAccess);
export type InviteMemberInput = z.input<typeof inviteMemberSchema>;

export const updateMemberSchema = z
  .object({
    organizationSlug: slugSchema,
    memberId: z.uuid(),
    role: z.enum(ASSIGNABLE_ROLES),
    ...access,
  })
  .superRefine(refineAccess);
export type UpdateMemberInput = z.input<typeof updateMemberSchema>;

export const memberActionSchema = z.object({ organizationSlug: slugSchema, memberId: z.uuid() });
export const invitationActionSchema = z.object({
  organizationSlug: slugSchema,
  invitationId: z.uuid(),
});
export const acceptInvitationSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/, "Invalid invitation link"),
});
