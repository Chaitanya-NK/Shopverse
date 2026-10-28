import { StarIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { SimplePagination } from "@/components/shared/simple-pagination";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { ReviewModerationCard } from "@/features/reviews/components/review-moderation-card";
import { StarRating } from "@/features/reviews/components/star-rating";
import { getReviewSummary, listReviews } from "@/features/reviews/queries";
import { REVIEW_FILTERS, type ReviewFilter } from "@/features/reviews/schemas";
import { loadReviewListParams, serializeReviewListParams } from "@/features/reviews/search-params";
import { listShops } from "@/features/shops/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Reviews" };

type Props = PageProps<"/app/[orgSlug]/reviews">;

const EMPTY: Record<ReviewFilter, string> = {
  all: "Shoppers who bought a product can review it from its page. Reviews appear here as they come in.",
  low: "No 1 or 2 star reviews.",
  unreplied: "Every published review has a reply.",
  hidden: "No hidden reviews.",
};

export default function ReviewsPage({ params, searchParams }: Props) {
  return (
    <>
      <PageHeader
        title="Reviews"
        description="What shoppers say about your products. Reply in public, or hide a review that breaks your rules."
      />
      <Suspense
        fallback={
          <>
            <Skeleton className="h-10 w-full max-w-2xl" />
            <Skeleton className="h-96 rounded-xl" />
          </>
        }
      >
        <ReviewsContent params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ReviewsContent({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const filters = await loadReviewListParams(searchParams);
  const { organization, role } = await requireMembership(orgSlug);
  const shops = await listShops(organization.id);
  const shop = shops.find((s) => s.slug === filters.shop) ?? null;
  const [result, summary] = await Promise.all([
    listReviews(organization.id, filters.filter, shop?.id ?? null, filters.page),
    getReviewSummary(organization.id),
  ]);
  const canModerate = can(role, "reviews.manage");

  return (
    <>
      {summary.average !== null && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-2xl font-semibold tabular-nums">
            {summary.average.toLocaleString("en-IN", { minimumFractionDigits: 1 })}
          </span>
          <StarRating value={summary.average} size="md" />
          <span className="text-muted-foreground">
            from {summary.count} published review{summary.count === 1 ? "" : "s"}
            {summary.hidden > 0 ? `, ${summary.hidden} hidden` : ""}
          </span>
        </div>
      )}
      <nav aria-label="Review filters" className="flex gap-1 overflow-x-auto border-b">
        {(Object.keys(REVIEW_FILTERS) as ReviewFilter[]).map((id) => {
          const active = id === filters.filter;
          return (
            <Link
              key={id}
              href={
                routes.orgReviews(orgSlug) +
                serializeReviewListParams({ filter: id, shop: filters.shop })
              }
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
                active
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {REVIEW_FILTERS[id]}
            </Link>
          );
        })}
      </nav>
      {result.items.length > 0 ? (
        <>
          <div className="space-y-3">
            {result.items.map((review) => (
              <ReviewModerationCard
                key={review.id}
                organizationSlug={orgSlug}
                review={review}
                canModerate={canModerate}
                showShop={!shop && shops.length > 1}
              />
            ))}
          </div>
          <SimplePagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            noun={result.total === 1 ? "review" : "reviews"}
            hrefFor={(page) =>
              routes.orgReviews(orgSlug) + serializeReviewListParams({ ...filters, page })
            }
          />
        </>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <StarIcon />
            </EmptyMedia>
            <EmptyTitle>No reviews here</EmptyTitle>
            <EmptyDescription>{EMPTY[filters.filter]}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </>
  );
}
