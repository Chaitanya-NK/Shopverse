"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { updateOrderNotes } from "@/features/orders/actions";

/** Internal note on an order; saved explicitly. */
export function OrderNotes({
  organizationSlug,
  orderId,
  initial,
  canEdit,
}: {
  organizationSlug: string;
  orderId: string;
  initial: string | null;
  canEdit: boolean;
}) {
  const [value, setValue] = useState(initial ?? "");
  const [isPending, startTransition] = useTransition();
  const dirty = value.trim() !== (initial ?? "").trim();

  if (!canEdit) {
    return (
      <p className="text-sm whitespace-pre-wrap text-muted-foreground">{initial || "No notes."}</p>
    );
  }

  return (
    <div className="space-y-2">
      <Textarea
        aria-label="Internal note"
        rows={3}
        maxLength={1000}
        value={value}
        placeholder="Only your team sees this."
        onChange={(e) => setValue(e.target.value)}
      />
      {dirty && (
        <Button
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await updateOrderNotes({ organizationSlug, orderId, notes: value });
              if (result.ok) toast.success("Note saved");
              else toast.error(result.error.message);
            })
          }
        >
          {isPending && <Spinner />}
          Save note
        </Button>
      )}
    </div>
  );
}
