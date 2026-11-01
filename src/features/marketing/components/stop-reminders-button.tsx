"use client";

import { CheckCircle2Icon } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { stopCartReminders } from "@/features/marketing/actions";

export function StopRemindersButton({ shopSlug, token }: { shopSlug: string; token: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  if (done)
    return (
      <p role="status" className="flex items-center gap-2 text-sm">
        <CheckCircle2Icon className="size-4 text-emerald-600" aria-hidden />
        Done. You won&apos;t get cart reminders from this shop.
      </p>
    );
  return (
    <div className="space-y-2">
      <Button
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await stopCartReminders({ shopSlug, token });
            if (result.ok) setDone(true);
            else setError(result.error.message);
          })
        }
      >
        {isPending && <Spinner />}
        Stop cart reminders
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
