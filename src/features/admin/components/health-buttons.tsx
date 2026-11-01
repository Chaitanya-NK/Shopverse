"use client";

import { CheckIcon, RotateCcwIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { resolveError, retryJob } from "@/features/admin/actions";

export function ResolveErrorButton({
  fingerprint,
  resolved,
}: {
  fingerprint: string;
  resolved: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant={resolved ? "outline" : "default"}
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await resolveError({ fingerprint, resolved: !resolved });
          if (!result.ok) toast.error(result.error.message);
          else toast.success(resolved ? "Reopened" : "Marked as resolved");
        })
      }
    >
      {isPending ? <Spinner /> : resolved ? <RotateCcwIcon /> : <CheckIcon />}
      {resolved ? "Reopen" : "Mark resolved"}
    </Button>
  );
}

export function RetryJobButton({ id, kind }: { id: number; kind: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      aria-label={`Retry job ${id} (${kind})`}
      onClick={() =>
        startTransition(async () => {
          const result = await retryJob({ id });
          if (!result.ok) toast.error(result.error.message);
          else toast.success("Queued again");
        })
      }
    >
      {isPending ? <Spinner /> : <RotateCcwIcon />}
      Retry
    </Button>
  );
}
