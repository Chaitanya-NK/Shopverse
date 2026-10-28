"use client";

import { TagIcon, XIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { applyDiscountCode, removeDiscountCode } from "@/features/storefront/actions";

/** "Have a discount code?" on the cart and checkout summaries. */
export function DiscountCodeForm({
  shopSlug,
  appliedCode,
  appliedTitle,
  problem,
}: {
  shopSlug: string;
  /** The code in use, if any. */
  appliedCode: string | null;
  appliedTitle: string | null;
  /** Why a remembered code no longer applies (e.g. it expired). */
  problem: string | null;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const remove = () =>
    startTransition(async () => {
      const result = await removeDiscountCode({ shopSlug });
      if (!result.ok) toast.error(result.error.message);
    });

  if (appliedCode && !problem)
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-primary/50 bg-primary/5 px-3 py-2 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <TagIcon className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="truncate">
            <span className="font-mono font-medium">{appliedCode}</span>
            {appliedTitle && <span className="text-muted-foreground"> · {appliedTitle}</span>}
          </span>
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={remove}
          disabled={isPending}
          aria-label={`Remove code ${appliedCode}`}
        >
          {isPending ? <Spinner /> : <XIcon />}
        </Button>
      </div>
    );

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const value = code.trim();
        if (!value) {
          setError("Enter a code");
          return;
        }
        startTransition(async () => {
          const result = await applyDiscountCode({ shopSlug, code: value });
          if (!result.ok) {
            setError(result.error.fieldErrors?.code?.[0] ?? result.error.message);
            return;
          }
          setError(null);
          setCode("");
          toast.success(`Code applied: ${result.data.title}`);
        });
      }}
    >
      <Field data-invalid={Boolean(error || problem)}>
        <FieldLabel htmlFor="discount-code">Discount code</FieldLabel>
        <div className="flex gap-2">
          <Input
            id="discount-code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError(null);
            }}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder={appliedCode ?? "Enter code"}
            className="font-mono uppercase"
            aria-invalid={Boolean(error || problem)}
          />
          <Button type="submit" variant="outline" disabled={isPending}>
            {isPending && <Spinner />}
            Apply
          </Button>
        </div>
        {(error || problem) && <FieldError>{error ?? `${appliedCode}: ${problem}`}</FieldError>}
      </Field>
      {problem && appliedCode && (
        <Button type="button" variant="link" className="h-auto px-0 text-xs" onClick={remove}>
          Remove {appliedCode}
        </Button>
      )}
    </form>
  );
}
