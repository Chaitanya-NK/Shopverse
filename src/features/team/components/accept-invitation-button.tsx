"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { routes } from "@/config/routes";
import { acceptInvitation } from "@/features/team/actions";

export function AcceptInvitationButton({
  token,
  organizationName,
}: {
  token: string;
  organizationName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      <Button
        size="lg"
        className="w-full"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptInvitation({ token });
            if (!result.ok) {
              setError(result.error.message);
              return;
            }
            toast.success(`Welcome to ${organizationName}`);
            router.push(routes.org(result.data.organizationSlug));
          })
        }
      >
        {isPending && <Spinner />}
        Join {organizationName}
      </Button>
      {error && <FieldError className="text-center">{error}</FieldError>}
    </div>
  );
}
