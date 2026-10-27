import "server-only";

import { cache } from "react";
import { z } from "zod";

import { type OrgRole } from "@/features/organizations/permissions";
import { fromPostgrestError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { Constants } from "@/types/database.types";

export type TeamMember = {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  role: OrgRole;
  allShops: boolean;
  shopIds: string[];
  joinedAt: string;
};

export type PendingInvitation = {
  id: string;
  email: string;
  role: OrgRole;
  allShops: boolean;
  shopIds: string[];
  expiresAt: string;
  createdAt: string;
};

export const listTeam = cache(async (organizationId: string): Promise<TeamMember[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_overview")
    .select("id, user_id, full_name, email, role, all_shops, shop_ids, created_at")
    .eq("organization_id", organizationId)
    .order("created_at");
  if (error) throw fromPostgrestError(error);

  const rank: Record<OrgRole, number> = { owner: 0, admin: 1, manager: 2, staff: 3, support: 4 };
  return data
    .map((m) => ({
      id: m.id,
      userId: m.user_id,
      name: m.full_name,
      email: m.email,
      role: m.role,
      allShops: m.all_shops,
      shopIds: m.shop_ids ?? [],
      joinedAt: m.created_at,
    }))
    .sort((a, b) => rank[a.role] - rank[b.role]);
});

/** Pending invitations (owners and admins only; others get an empty list via RLS). */
export const listInvitations = cache(
  async (organizationId: string): Promise<PendingInvitation[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("organization_invitations")
      .select("id, email, role, all_shops, shop_ids, expires_at, created_at")
      .eq("organization_id", organizationId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    if (error) throw fromPostgrestError(error);
    return data.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      allShops: i.all_shops,
      shopIds: i.shop_ids,
      expiresAt: i.expires_at,
      createdAt: i.created_at,
    }));
  },
);

const invitationPreviewSchema = z
  .object({
    organization: z.object({ name: z.string(), slug: z.string() }),
    email: z.string(),
    role: z.enum(Constants.public.Enums.org_role),
    invited_by: z.string().nullable(),
    expires_at: z.string(),
    status: z.enum(["pending", "accepted", "expired", "revoked"]),
  })
  .transform(({ invited_by, expires_at, ...rest }) => ({
    ...rest,
    invitedBy: invited_by,
    expiresAt: expires_at,
  }));

export type InvitationPreview = z.output<typeof invitationPreviewSchema>;

/** What an invitation link is for (anyone holding the link may see this). */
export const getInvitationPreview = cache(
  async (token: string): Promise<InvitationPreview | null> => {
    if (!/^[0-9a-f]{64}$/.test(token)) return null;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_invitation", { p_token: token });
    if (error) throw fromPostgrestError(error);
    return data ? invitationPreviewSchema.parse(data) : null;
  },
);
