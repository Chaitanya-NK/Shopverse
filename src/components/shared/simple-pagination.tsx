import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

type SimplePaginationProps = {
  page: number;
  pageCount: number;
  total: number;
  /** Builds the URL for a page, keeping the current filters. */
  hrefFor: (page: number) => string;
  noun?: string;
};

/** Previous / next pagination with a "Page x of y" summary. */
export function SimplePagination({
  page,
  pageCount,
  total,
  hrefFor,
  noun = "results",
}: SimplePaginationProps) {
  if (pageCount <= 1) {
    return (
      <p className="text-sm text-muted-foreground">
        {total} {noun}
      </p>
    );
  }
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground">
        Page {page} of {pageCount} · {total} {noun}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={hrefFor(page - 1)} rel="prev">
              <ChevronLeftIcon />
              Previous
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeftIcon />
            Previous
          </Button>
        )}
        {page < pageCount ? (
          <Button asChild variant="outline" size="sm">
            <Link href={hrefFor(page + 1)} rel="next">
              Next
              <ChevronRightIcon />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next
            <ChevronRightIcon />
          </Button>
        )}
      </div>
    </nav>
  );
}
