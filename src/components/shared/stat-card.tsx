import { type LucideIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type Stat = {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone?: "warning" | "danger";
};

/** A headline number with a short explanation. */
export function StatCard({ label, value, hint, icon: Icon, tone }: Stat) {
  return (
    <Card className="gap-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardDescription>{label}</CardDescription>
        <Icon
          aria-hidden="true"
          className={cn(
            "size-4 text-muted-foreground",
            tone === "warning" && "text-warning-foreground",
            tone === "danger" && "text-destructive",
          )}
        />
      </CardHeader>
      <CardContent className="space-y-1">
        <CardTitle className="font-mono text-2xl tabular-nums">{value}</CardTitle>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

const COLUMNS = { 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 xl:grid-cols-4" } as const;

export function StatGrid({ stats, columns = 4 }: { stats: readonly Stat[]; columns?: 3 | 4 }) {
  return (
    <div className={cn("grid gap-4", COLUMNS[columns])}>
      {stats.map((stat) => (
        <StatCard key={stat.label} {...stat} />
      ))}
    </div>
  );
}

export function StatGridSkeleton({ count = 4, columns = 4 }: { count?: number; columns?: 3 | 4 }) {
  return (
    <div className={cn("grid gap-4", COLUMNS[columns])}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-[118px] rounded-xl" />
      ))}
    </div>
  );
}
