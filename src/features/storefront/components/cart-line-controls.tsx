"use client";

import { MinusIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { changeCart } from "@/features/storefront/actions";

export function CartLineControls({
  shopSlug,
  variantId,
  quantity,
  max,
  label,
}: {
  shopSlug: string;
  variantId: string;
  quantity: number;
  max: number;
  label: string;
}) {
  const [isPending, startTransition] = useTransition();
  const set = (next: number) =>
    startTransition(async () => {
      const result = await changeCart({ shopSlug, variantId, quantity: next, mode: "set" });
      if (!result.ok) toast.error(result.error.fieldErrors?.variantId?.[0] ?? result.error.message);
    });

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center rounded-lg border"
        role="group"
        aria-label={`Quantity of ${label}`}
      >
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Fewer"
          disabled={isPending || quantity <= 1}
          onClick={() => set(quantity - 1)}
        >
          <MinusIcon />
        </Button>
        <span className="w-7 text-center text-sm tabular-nums">
          {isPending ? <Spinner className="mx-auto" /> : quantity}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="More"
          disabled={isPending || quantity >= max}
          onClick={() => set(quantity + 1)}
        >
          <PlusIcon />
        </Button>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground"
        aria-label={`Remove ${label}`}
        disabled={isPending}
        onClick={() => set(0)}
      >
        <Trash2Icon />
      </Button>
    </div>
  );
}
