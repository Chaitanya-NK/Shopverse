"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { StarIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { type z } from "zod";

import { FormRootError } from "@/components/shared/form-root-error";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { saveReview } from "@/features/reviews/actions";
import { type ReviewFormInput, reviewFormSchema } from "@/features/reviews/schemas";
import { applyActionError } from "@/lib/forms/apply-action-error";
import { cn } from "@/lib/utils";

const LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

export function WriteReviewDialog({
  shopSlug,
  productId,
  productTitle,
  existing,
}: {
  shopSlug: string;
  productId: string;
  productTitle: string;
  existing: { rating: number; title: string | null; body: string | null } | null;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [hover, setHover] = useState(0);
  const form = useForm<ReviewFormInput, unknown, z.output<typeof reviewFormSchema>>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: {
      shopSlug,
      productId,
      rating: existing?.rating ?? 0,
      title: existing?.title ?? "",
      body: existing?.body ?? "",
    },
  });
  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await saveReview(values);
      if (!result.ok) {
        applyActionError(form, result.error);
        return;
      }
      toast.success(existing ? "Review updated" : "Thanks for your review!");
      setOpen(false);
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{existing ? "Edit your review" : "Write a review"}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit your review" : "Review this product"}</DialogTitle>
          <DialogDescription>{productTitle}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Controller
            control={form.control}
            name="rating"
            render={({ field, fieldState }) => {
              const value = Number(field.value) || 0;
              const shown = hover || value;
              return (
                <FieldSet data-invalid={fieldState.invalid}>
                  <FieldLegend variant="label">Your rating</FieldLegend>
                  <div className="flex items-center gap-3">
                    <div
                      role="radiogroup"
                      aria-label="Stars"
                      className="flex"
                      onMouseLeave={() => setHover(0)}
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={value === n}
                          aria-label={`${n} star${n === 1 ? "" : "s"}`}
                          onMouseEnter={() => setHover(n)}
                          onClick={() => field.onChange(n)}
                          className="rounded p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <StarIcon
                            className={cn(
                              "size-7 transition-colors",
                              n <= shown
                                ? "fill-amber-400 text-amber-400"
                                : "text-muted-foreground/40",
                            )}
                          />
                        </button>
                      ))}
                    </div>
                    <span className="text-sm text-muted-foreground">{LABELS[shown]}</span>
                  </div>
                  <FieldError errors={[fieldState.error]} />
                </FieldSet>
              );
            }}
          />
          <FieldGroup className="gap-4">
            <Controller
              control={form.control}
              name="title"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="review-title">Headline (optional)</FieldLabel>
                  <Input
                    id="review-title"
                    maxLength={120}
                    {...field}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="body"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="review-body">Your review (optional)</FieldLabel>
                  <Textarea
                    id="review-body"
                    rows={4}
                    maxLength={2000}
                    placeholder="How's the fit, quality, delivery?"
                    {...field}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>
          <FormRootError form={form} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner />}
              {existing ? "Save review" : "Post review"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
