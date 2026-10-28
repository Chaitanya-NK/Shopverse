/**
 * Report date ranges, in India time. Dates are "YYYY-MM-DD" strings so the
 * same range means the same days on the server, in the browser and in Postgres.
 */

export const RANGE_PRESETS = ["7d", "30d", "90d", "month", "last-month", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_LABELS: Record<RangePreset, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  month: "This month",
  "last-month": "Last month",
  custom: "Custom",
};

export const MAX_RANGE_DAYS = 366;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;

/** Today's date in India. */
export function todayInIndia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

const toUtc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  return fromUtc(toUtc(iso) + days * DAY);
}

/** Days from `from` to `to`, counting both. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY) + 1;
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO.test(value)) return false;
  return fromUtc(toUtc(value)) === value;
}

function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export type ResolvedRange = { preset: RangePreset; from: string; to: string; days: number };

/**
 * Turn the URL's choice into concrete days. A custom range that is missing,
 * backwards or longer than a year falls back to the last 30 days.
 */
export function resolveRange(
  preset: RangePreset,
  custom: { from?: string | null; to?: string | null } = {},
  now: Date = new Date(),
): ResolvedRange {
  const today = todayInIndia(now);
  const make = (p: RangePreset, from: string, to: string): ResolvedRange => ({
    preset: p,
    from,
    to,
    days: daysBetween(from, to),
  });
  switch (preset) {
    case "7d":
      return make(preset, addDays(today, -6), today);
    case "90d":
      return make(preset, addDays(today, -89), today);
    case "month":
      return make(preset, startOfMonth(today), today);
    case "last-month": {
      const end = addDays(startOfMonth(today), -1);
      return make(preset, startOfMonth(end), end);
    }
    case "custom": {
      const { from, to } = custom;
      if (
        isIsoDate(from) &&
        isIsoDate(to) &&
        from <= to &&
        daysBetween(from, to) <= MAX_RANGE_DAYS
      ) {
        return make(preset, from, to);
      }
      return make("30d", addDays(today, -29), today);
    }
    case "30d":
    default:
      return make("30d", addDays(today, -29), today);
  }
}

/** "YYYY-MM" for a month report; falls back to last month (the one you file). */
export function resolveMonth(value: string | null | undefined, now: Date = new Date()): string {
  const current = todayInIndia(now).slice(0, 7);
  if (value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value <= current) return value;
  return addDays(`${current}-01`, -1).slice(0, 7);
}

/** The months offered in the month picker, newest first. */
export function recentMonths(count: number, now: Date = new Date()): string[] {
  const months: string[] = [];
  let cursor = `${todayInIndia(now).slice(0, 7)}-01`;
  for (let i = 0; i < count; i += 1) {
    months.push(cursor.slice(0, 7));
    cursor = startOfMonth(addDays(cursor, -1));
  }
  return months;
}

const monthName = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
export function formatMonth(month: string): string {
  return monthName.format(new Date(toUtc(`${month}-01`)));
}

const dayFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const dayYearFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
export function formatDay(iso: string, withYear = false): string {
  return (withYear ? dayYearFormat : dayFormat).format(new Date(toUtc(iso)));
}

/** "1 Oct – 27 Oct 2026". */
export function formatRange(from: string, to: string): string {
  if (from === to) return formatDay(from, true);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${formatDay(from, !sameYear)} – ${formatDay(to, true)}`;
}
