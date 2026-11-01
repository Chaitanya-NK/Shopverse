"use client";

import { CheckCircle2Icon } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { subscribeNewsletter } from "@/features/marketing/newsletter";
import { useT } from "@/i18n/client";

export function NewsletterForm({
  shopSlug,
  buttonLabel,
  inverted,
}: {
  shopSlug: string;
  buttonLabel: string;
  /** On the brand colour. */
  inverted?: boolean;
}) {
  const t = useT();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (done)
    return (
      <p className="flex items-center justify-center gap-2 font-medium" role="status">
        <CheckCircle2Icon className="size-5" aria-hidden />
        {t("You're on the list. Thank you!")}
      </p>
    );

  return (
    <form
      className="mx-auto w-full max-w-md space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(async () => {
          setError(null);
          const result = await subscribeNewsletter({
            shopSlug,
            email: String(data.get("email") ?? ""),
            website: String(data.get("website") ?? ""),
          });
          if (result.ok) setDone(true);
          else setError(t(result.error.message));
        });
      }}
    >
      <div className="flex gap-2">
        <Input
          type="email"
          name="email"
          required
          maxLength={254}
          autoComplete="email"
          placeholder={t("Your email")}
          aria-label={t("Email address")}
          aria-invalid={Boolean(error)}
          className={
            inverted
              ? "border-primary-foreground/30 bg-primary-foreground text-foreground"
              : "bg-background"
          }
        />
        {/* Left empty by people; bots fill it in. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          className="hidden"
          aria-hidden
        />
        <Button type="submit" disabled={isPending} variant={inverted ? "secondary" : "default"}>
          {buttonLabel || t("Sign up")}
        </Button>
      </div>
      {error && (
        <p className="text-sm font-medium" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
