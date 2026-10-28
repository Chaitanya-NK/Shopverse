import { BadgeCheckIcon } from "lucide-react";
import Link from "next/link";

import { Progress } from "@/components/ui/progress";
import { routes } from "@/config/routes";
import { StarRating } from "@/features/reviews/components/star-rating";
import { WriteReviewDialog } from "@/features/reviews/components/write-review-dialog";
import { getProductReviews, getReviewStatus } from "@/features/reviews/queries";

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

/** Ratings summary, reviews and (for verified buyers) a way to write one. */
export async function ProductReviews({
  shop,
  product,
}: {
  shop: { id: string; slug: string; live: boolean };
  product: { id: string; slug: string; title: string };
}) {
  const [reviews, status] = await Promise.all([
    getProductReviews(shop.id, product.id),
    shop.live ? getReviewStatus(shop.id, product.id) : null,
  ]);
  const productPath = routes.storefrontProduct(shop.slug, product.slug);

  return (
    <section
      id="reviews"
      aria-labelledby="reviews-heading"
      className="scroll-mt-24 space-y-6 border-t pt-10"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 id="reviews-heading" className="text-xl font-semibold tracking-tight">
            Customer reviews
          </h2>
          {reviews.count > 0 && reviews.average !== null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <StarRating value={reviews.average} size="md" />
              <span>
                <span className="font-medium text-foreground">{reviews.average.toFixed(1)}</span>{" "}
                out of 5 · {reviews.count} review{reviews.count === 1 ? "" : "s"}
              </span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No reviews yet.</p>
          )}
        </div>
        {status?.eligible ? (
          <WriteReviewDialog
            shopSlug={shop.slug}
            productId={product.id}
            productTitle={product.title}
            existing={status.review}
          />
        ) : status && !status.signedIn ? (
          <p className="text-sm text-muted-foreground">
            Bought this?{" "}
            <Link
              href={routes.storefrontSignIn(shop.slug, `${productPath}#reviews`)}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Sign in
            </Link>{" "}
            to review it.
          </p>
        ) : status ? (
          <p className="text-sm text-muted-foreground">
            Reviews are from customers who received this product.
          </p>
        ) : null}
      </div>

      {reviews.count > 0 && (
        <div className="grid gap-8 md:grid-cols-[16rem_minmax(0,1fr)]">
          <dl className="space-y-2" aria-label="Ratings breakdown">
            {reviews.distribution.map((d) => (
              <div
                key={d.stars}
                className="grid grid-cols-[3.5rem_minmax(0,1fr)_2rem] items-center gap-2 text-sm"
              >
                <dt className="text-muted-foreground">{d.stars} star</dt>
                <dd>
                  <Progress
                    value={reviews.count ? (d.count / reviews.count) * 100 : 0}
                    className="h-2 [&>div]:bg-amber-400"
                    aria-label={`${d.count} of ${reviews.count} reviews give ${d.stars} stars`}
                  />
                </dd>
                <dd className="text-right text-muted-foreground tabular-nums">{d.count}</dd>
              </div>
            ))}
          </dl>
          <ul className="space-y-6">
            {reviews.items.map((r, i) => (
              <li key={i} className="space-y-1.5 border-b pb-6 last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StarRating value={r.rating} />
                  {r.title && <span className="font-medium">{r.title}</span>}
                </div>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  {r.author}
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                    <BadgeCheckIcon className="size-3.5" aria-hidden />
                    Verified buyer
                  </span>
                  <span>· {dateFormat.format(new Date(r.createdAt))}</span>
                </p>
                {r.body && <p className="text-sm leading-relaxed whitespace-pre-line">{r.body}</p>}
                {r.reply && (
                  <div className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm">
                    <span className="font-medium">Reply from the shop: </span>
                    {r.reply}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
