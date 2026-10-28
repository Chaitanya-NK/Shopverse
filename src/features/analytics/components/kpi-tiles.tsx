import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type Kpi = {
  label: string;
  value: string;
  /** Fractional change against the previous period; null when there was nothing before. */
  change: number | null;
  /** Shown under the value. */
  hint: string;
};

const percent = new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 1 });

function Delta({ change, period }: { change: number | null; period: string }) {
  if (change === null) {
    return (
      <p className="text-xs text-muted-foreground">New this period · nothing in the {period}</p>
    );
  }
  const flat = Math.abs(change) < 0.0005;
  const up = change > 0;
  const Icon = flat ? MinusIcon : up ? ArrowUpRightIcon : ArrowDownRightIcon;
  return (
    <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-medium whitespace-nowrap",
          !flat && up && "text-success-foreground",
          !flat && !up && "text-destructive",
        )}
      >
        <Icon aria-hidden="true" className="size-3.5" />
        {flat ? "No change" : `${up ? "Up" : "Down"} ${percent.format(Math.abs(change))}`}
      </span>
      <span className="whitespace-nowrap">vs the {period}</span>
    </p>
  );
}

/** Headline numbers with the change against the previous period of the same length. */
export function KpiTiles({ kpis, period }: { kpis: Kpi[]; period: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((k) => (
        <Card key={k.label} className="gap-2">
          <CardHeader>
            <CardDescription>{k.label}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <CardTitle className="font-mono text-2xl tabular-nums">{k.value}</CardTitle>
            <Delta change={k.change} period={period} />
            <p className="text-xs text-muted-foreground">{k.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function KpiTilesSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-[138px] rounded-xl" />
      ))}
    </div>
  );
}
