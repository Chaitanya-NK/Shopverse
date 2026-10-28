import { Undo2Icon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { SimplePagination } from "@/components/shared/simple-pagination";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/routes";
import { requireMembership } from "@/features/organizations/queries";
import { ReturnsTable } from "@/features/returns/components/returns-table";
import { countReturns, listReturns } from "@/features/returns/queries";
import { loadReturnListParams, serializeReturnListParams } from "@/features/returns/search-params";
import { RETURN_VIEW_IDS, RETURN_VIEWS } from "@/features/returns/views";
import { listShops } from "@/features/shops/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Returns" };

type Props = PageProps<"/app/[orgSlug]/returns">;

const EMPTY: Record<(typeof RETURN_VIEW_IDS)[number], string> = {
  review: "No return requests are waiting. New ones from shoppers appear here.",
  pickup: "No approved returns are waiting to be collected.",
  settle: "Nothing to refund or exchange right now.",
  done: "Completed returns will be listed here.",
  closed: "No declined or withdrawn returns.",
};

export default function ReturnsPage({ params, searchParams }: Props) {
  return (
    <>
      <PageHeader
        title="Returns"
        description="Return and exchange requests, pickups, refunds and GST credit notes. Start a return for any order from its page."
      />
      <Suspense
        fallback={
          <>
            <Skeleton className="h-10 w-full max-w-2xl" />
            <Skeleton className="h-96 rounded-xl" />
          </>
        }
      >
        <ReturnsContent params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ReturnsContent({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const filters = await loadReturnListParams(searchParams);
  const { organization } = await requireMembership(orgSlug);
  const shops = await listShops(organization.id);
  const shop = shops.find((s) => s.slug === filters.shop) ?? null;
  const [result, counts] = await Promise.all([
    listReturns(organization.id, filters.view, shop?.id ?? null, filters.page),
    countReturns(organization.id, shop?.id ?? null),
  ]);

  return (
    <>
      <nav aria-label="Return stages" className="flex gap-1 overflow-x-auto border-b">
        {RETURN_VIEW_IDS.map((id) => {
          const active = id === filters.view;
          return (
            <Link
              key={id}
              href={
                routes.orgReturns(orgSlug) +
                serializeReturnListParams({ view: id, shop: filters.shop })
              }
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
                active
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {RETURN_VIEWS[id].label}
              <Badge
                variant={active ? "default" : "secondary"}
                className="h-5 min-w-5 px-1.5 tabular-nums"
              >
                {counts[id] ?? 0}
              </Badge>
            </Link>
          );
        })}
      </nav>
      {result.items.length > 0 ? (
        <>
          <ReturnsTable
            organizationSlug={orgSlug}
            rows={result.items}
            showShop={!shop && shops.length > 1}
          />
          <SimplePagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            noun={result.total === 1 ? "return" : "returns"}
            hrefFor={(page) =>
              routes.orgReturns(orgSlug) + serializeReturnListParams({ ...filters, page })
            }
          />
        </>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Undo2Icon />
            </EmptyMedia>
            <EmptyTitle>Nothing here</EmptyTitle>
            <EmptyDescription>{EMPTY[filters.view]}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </>
  );
}
