import { MailWarningIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { signOut } from "@/features/auth/actions";
import { ROLE_LABELS } from "@/features/organizations/permissions";
import { AcceptInvitationButton } from "@/features/team/components/accept-invitation-button";
import { getInvitationPreview } from "@/features/team/queries";
import { ROLE_DESCRIPTIONS } from "@/features/team/schemas";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Team invitation",
  robots: { index: false },
  referrer: "no-referrer",
};

type Props = PageProps<"/invite/[token]">;

export default function InvitePage({ params }: Props) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-10">
      <Logo />
      <Suspense fallback={<Skeleton className="h-80 w-full max-w-md rounded-xl" />}>
        <Invitation params={params} />
      </Suspense>
    </main>
  );
}

async function Invitation({ params }: Pick<Props, "params">) {
  const { token } = await params;
  const [invite, user] = await Promise.all([getInvitationPreview(token), getSessionUser()]);
  const here = routes.invitation(token);

  if (!invite || invite.status !== "pending") {
    const message = !invite
      ? "This link isn't valid. It may have been replaced by a newer invitation."
      : invite.status === "accepted"
        ? "This invitation has already been used."
        : invite.status === "expired"
          ? "This invitation has expired. Ask the person who invited you to send a new one."
          : "This invitation was withdrawn.";
    return (
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <MailWarningIcon className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <CardTitle>Invitation unavailable</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href={routes.app}>Go to Shopverse</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const wrongAccount = user && user.email.toLowerCase() !== invite.email.toLowerCase();

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <UsersIcon className="mx-auto size-8 text-primary" aria-hidden />
        <CardTitle className="text-xl">Join {invite.organization.name}</CardTitle>
        <CardDescription>
          {invite.invitedBy ?? "A teammate"} invited{" "}
          <span className="font-medium text-foreground">{invite.email}</span> as{" "}
          <span className="font-medium text-foreground">{ROLE_LABELS[invite.role]}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
          {ROLE_DESCRIPTIONS[invite.role]}
        </p>
        {!user ? (
          <div className="grid gap-2">
            <Button asChild size="lg">
              <Link href={routes.signUp(here)}>Create my account</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={routes.signIn(here)}>I already have an account</Link>
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Use {invite.email}. We&apos;ll email you a sign-in code.
            </p>
          </div>
        ) : wrongAccount ? (
          <div className="space-y-3 text-center text-sm">
            <p>
              You&apos;re signed in as <span className="font-medium">{user.email}</span>. This
              invitation is for <span className="font-medium">{invite.email}</span>.
            </p>
            <form action={signOut}>
              <Button type="submit" variant="outline">
                Sign out and switch account
              </Button>
            </form>
          </div>
        ) : (
          <AcceptInvitationButton token={token} organizationName={invite.organization.name} />
        )}
      </CardContent>
    </Card>
  );
}
