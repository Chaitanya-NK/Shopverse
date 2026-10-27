"use server";

import { refresh } from "next/cache";

import { env } from "@/env";
import { routes } from "@/config/routes";
import { authorizeOrganization } from "@/features/organizations/server";
import { invitationEmail } from "@/features/team/emails";
import {
  acceptInvitationSchema,
  invitationActionSchema,
  inviteMemberSchema,
  memberActionSchema,
  roleHasAllShops,
  updateMemberSchema,
} from "@/features/team/schemas";
import { createAction } from "@/lib/actions/create-action";
import { fromPostgrestError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";

const TEAM_FORBIDDEN = "Only owners and admins can manage the team.";

export const inviteMember = createAction({
  name: "team.invite",
  schema: inviteMemberSchema,
  handler: async (input, { supabase, user }) => {
    const org = await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "members.manage",
      TEAM_FORBIDDEN,
    );
    const allShops = input.allShops || roleHasAllShops(input.role);

    const { data, error } = await supabase.rpc("invite_member", {
      p_organization_id: org.id,
      p_email: input.email,
      p_role: input.role,
      p_all_shops: allShops,
      p_shop_ids: allShops ? [] : input.shopIds,
    });
    if (error) throw fromPostgrestError(error, { conflictField: "email" });

    const { token } = data as { token: string };
    const link = new URL(routes.invitation(token), env.NEXT_PUBLIC_APP_URL).toString();

    const { data: orgRow } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", org.id)
      .single();
    let emailed = true;
    try {
      await sendMail(
        invitationEmail({
          to: input.email,
          organizationName: orgRow?.name ?? "your team",
          inviterName: user.fullName ?? user.email,
          role: input.role,
          link,
        }),
      );
    } catch (cause) {
      // The invitation exists; the inviter can still copy and share the link.
      emailed = false;
      logger.warn({ err: cause }, "Invitation email failed");
    }

    refresh();
    return { link, emailed };
  },
});

export const revokeInvitation = createAction({
  name: "team.revokeInvitation",
  schema: invitationActionSchema,
  handler: async (input, { supabase, user }) => {
    await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "members.manage",
      TEAM_FORBIDDEN,
    );
    const { error } = await supabase.rpc("revoke_invitation", {
      p_invitation_id: input.invitationId,
    });
    if (error) throw fromPostgrestError(error);
    refresh();
    return { ok: true };
  },
});

export const updateMember = createAction({
  name: "team.updateMember",
  schema: updateMemberSchema,
  handler: async (input, { supabase, user }) => {
    await authorizeOrganization(
      supabase,
      user.id,
      input.organizationSlug,
      "members.manage",
      TEAM_FORBIDDEN,
    );
    const allShops = input.allShops || roleHasAllShops(input.role);
    const { error } = await supabase.rpc("update_member", {
      p_member_id: input.memberId,
      p_role: input.role,
      p_all_shops: allShops,
      p_shop_ids: allShops ? [] : input.shopIds,
    });
    if (error) throw fromPostgrestError(error);
    refresh();
    return { ok: true };
  },
});

/** Remove a teammate, or leave the organization (memberId = your own). */
export const removeMember = createAction({
  name: "team.removeMember",
  schema: memberActionSchema,
  handler: async (input, { supabase }) => {
    const { error } = await supabase.rpc("remove_member", { p_member_id: input.memberId });
    if (error) throw fromPostgrestError(error);
    refresh();
    return { ok: true };
  },
});

export const acceptInvitation = createAction({
  name: "team.acceptInvitation",
  schema: acceptInvitationSchema,
  handler: async (input, { supabase }) => {
    const { data, error } = await supabase.rpc("accept_invitation", { p_token: input.token });
    if (error) throw fromPostgrestError(error);
    return { organizationSlug: (data as { organization_slug: string }).organization_slug };
  },
});
