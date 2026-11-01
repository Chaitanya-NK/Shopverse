import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { makeTranslate, type Translate } from "@/i18n/core";

type SimplePaginationProps = {
  page: number;
  pageCount: number;
  total: number;
  /** Builds the URL for a page, keeping the current filters. */
  hrefFor: (page: number) => string;
  noun?: string;
  /** Storefront pages pass their translator. */
  t?: Translate;
};

const english = makeTranslate("en", null);

/** Previous / next pagination with a "Page x of y" summary. */
export function SimplePagination({
  page,
  pageCount,
  total,
  hrefFor,
  noun = "results",
  t = english,
}: SimplePaginationProps) {
  if (pageCount <= 1) {
    return (
      <p className="text-sm text-muted-foreground">
        {total} {t(noun)}
      </p>
    );
  }
  return (
    <nav aria-label={t("Pagination")} className="flex items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground">
        {t("Page {page} of {count}", { page, count: pageCount })} · {total} {t(noun)}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={hrefFor(page - 1)} rel="prev">
              <ChevronLeftIcon />
              {t("Previous")}
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeftIcon />
            {t("Previous")}
          </Button>
        )}
        {page < pageCount ? (
          <Button asChild variant="outline" size="sm">
            <Link href={hrefFor(page + 1)} rel="next">
              {t("Next")}
              <ChevronRightIcon />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            {t("Next")}
            <ChevronRightIcon />
          </Button>
        )}
      </div>
    </nav>
  );
}
