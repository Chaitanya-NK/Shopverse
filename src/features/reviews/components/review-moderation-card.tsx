"use client";

import { EyeIcon, EyeOffIcon, MessageSquareReplyIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { moderateReview } from "@/features/reviews/actions";
import { StarRating } from "@/features/reviews/components/star-rating";
import { type StaffReview } from "@/features/reviews/queries";

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

/** One review with hide/publish and a public reply from the business. */
export function ReviewModerationCard({
  organizationSlug,
  review,
  canModerate,
  showShop,
}: {
  organizationSlug: string;
  review: StaffReview;
  canModerate: boolean;
  showShop: boolean;
}) {
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState(review.reply ?? "");
  const [isPending, startTransition] = useTransition();
  const hidden = review.status === "hidden";

  const save = (status: StaffReview["status"], nextReply: string | null, done: string) =>
    startTransition(async () => {
      const result = await moderateReview({
        organizationSlug,
        reviewId: review.id,
        status,
        reply: nextReply,
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(done);
      setReplying(false);
    });

  return (
    <Card className={hidden ? "bg-muted/40" : undefined}>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <StarRating value={review.rating} size="md" />
              {review.title && <span className="font-medium">{review.title}</span>}
              {hidden && <Badge variant="outline">Hidden from shoppers</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {review.productTitle}
              {showShop ? ` · ${review.shopName}` : ""} · {review.customerName ?? "Shopper"}
              {review.customerEmail ? ` (${review.customerEmail})` : ""} ·{" "}
              {dateFormat.format(new Date(review.createdAt))}
            </p>
          </div>
          {canModerate && (
            <div className="flex gap-2">
              {!replying && (
                <Button size="sm" variant="outline" onClick={() => setReplying(true)}>
                  <MessageSquareReplyIcon />
                  {review.reply ? "Edit reply" : "Reply"}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() =>
                  save(
                    hidden ? "published" : "hidden",
                    review.reply,
                    hidden ? "Review published" : "Review hidden",
                  )
                }
              >
                {hidden ? <EyeIcon /> : <EyeOffIcon />}
                {hidden ? "Publish" : "Hide"}
              </Button>
            </div>
          )}
        </div>
        {review.body && <p className="text-sm whitespace-pre-line">{review.body}</p>}
        {replying ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              save(
                review.status,
                reply.trim() || null,
                reply.trim() ? "Reply saved" : "Reply removed",
              );
            }}
          >
            <Field>
              <FieldLabel htmlFor={`reply-${review.id}`}>Your reply</FieldLabel>
              <Textarea
                id={`reply-${review.id}`}
                rows={3}
                maxLength={1000}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              <FieldDescription>
                Shown under the review in your shop. Leave empty to remove it.
              </FieldDescription>
            </Field>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending && <Spinner />}
                Save reply
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setReply(review.reply ?? "");
                  setReplying(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          review.reply && (
            <div className="rounded-lg border-l-2 bg-muted/50 px-3 py-2 text-sm">
              <p className="text-xs font-medium text-muted-foreground">Your reply</p>
              <p className="whitespace-pre-line">{review.reply}</p>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
