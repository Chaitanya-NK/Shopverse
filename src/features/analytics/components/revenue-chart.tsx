"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDay } from "@/features/analytics/ranges";
import { formatMoney, formatNumber } from "@/lib/format";

type Point = { day: string; revenue: number; orders: number };

const config = {
  revenue: { label: "Sales", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** Daily sales as an area chart, with a crosshair tooltip and a table view. */
export function RevenueChart({ data, currency }: { data: Point[]; currency: string }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const long = data.length > 120;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={view}
          onValueChange={(v) => v && setView(v as "chart" | "table")}
          aria-label="Show sales as"
        >
          <ToggleGroupItem value="chart">Chart</ToggleGroupItem>
          <ToggleGroupItem value="table">Table</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {view === "chart" ? (
        <ChartContainer config={config} className="aspect-auto h-64 w-full">
          <AreaChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="sales-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-revenue)" stopOpacity={0.14} />
                <stop offset="100%" stopColor="var(--color-revenue)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="0" />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={long ? 48 : 28}
              tickFormatter={(d: string) => formatDay(d)}
            />
            <YAxis
              width={64}
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              allowDecimals={false}
              tickFormatter={(v: number) => formatMoney(v, currency, { compact: true })}
            />
            <ChartTooltip
              cursor={{ strokeWidth: 1 }}
              content={({ active, payload }) => {
                const point = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
                if (!point) return null;
                return (
                  <div className="grid min-w-36 gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
                    <span className="font-medium">{formatDay(point.day, true)}</span>
                    <span className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="size-2.5 rounded-[2px] bg-(--color-revenue)" />
                        Sales
                      </span>
                      <span className="font-mono tabular-nums">
                        {formatMoney(point.revenue, currency)}
                      </span>
                    </span>
                    <span className="flex items-center justify-between gap-4 text-muted-foreground">
                      <span className="pl-4">Orders</span>
                      <span className="font-mono tabular-nums">{formatNumber(point.orders)}</span>
                    </span>
                  </div>
                );
              }}
            />
            <Area
              dataKey="revenue"
              type="monotone"
              stroke="var(--color-revenue)"
              strokeWidth={2}
              fill="url(#sales-fill)"
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      ) : (
        <div className="max-h-64 overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead>Day</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Sales</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...data].reverse().map((p) => (
                <TableRow key={p.day}>
                  <TableCell>{formatDay(p.day, true)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatNumber(p.orders)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatMoney(p.revenue, currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
