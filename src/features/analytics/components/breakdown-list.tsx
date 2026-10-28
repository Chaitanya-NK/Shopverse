import { cn } from "@/lib/utils";

export type BreakdownRow = {
  key: string;
  label: string;
  /** Drives the bar length. */
  value: number;
  /** Formatted value shown at the end of the row. */
  display: string;
  /** Secondary detail, e.g. "12 orders". */
  detail?: string;
};

/**
 * A ranked list with a thin magnitude bar under each label. One hue: the bars
 * show size, not identity, and every value is printed beside its bar.
 */
export function BreakdownList({
  rows,
  empty,
  label,
}: {
  rows: BreakdownRow[];
  empty: string;
  label: string;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  const max = Math.max(...rows.map((r) => r.value), 0);
  return (
    <ol aria-label={label} className="space-y-3">
      {rows.map((row) => {
        const share = max > 0 ? Math.max(row.value / max, 0) : 0;
        return (
          <li key={row.key} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate" title={row.label}>
                {row.label}
              </span>
              <span className="shrink-0 font-mono tabular-nums">
                {row.display}
                {row.detail && (
                  <span className="ml-2 font-sans text-xs text-muted-foreground">{row.detail}</span>
                )}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted" aria-hidden="true">
              <div
                className={cn("h-full rounded-full bg-chart-1", share === 0 && "hidden")}
                style={{ width: `${Math.max(share * 100, 1.5)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
