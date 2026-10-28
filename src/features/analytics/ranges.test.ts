import { describe, expect, it } from "vitest";

import {
  addDays,
  daysBetween,
  formatMonth,
  formatRange,
  isIsoDate,
  recentMonths,
  resolveMonth,
  resolveRange,
  todayInIndia,
} from "@/features/analytics/ranges";

// 27 Oct 2026, 20:00 UTC = 28 Oct 01:30 in India.
const lateNight = new Date("2026-10-27T20:00:00Z");
const midday = new Date("2026-10-27T06:00:00Z");

describe("ranges", () => {
  it("uses India's date, not UTC", () => {
    expect(todayInIndia(lateNight)).toBe("2026-10-28");
    expect(todayInIndia(midday)).toBe("2026-10-27");
  });

  it("does day arithmetic across months and leap years", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(31);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-02-28")).toBe(true);
  });

  it("resolves presets ending today", () => {
    expect(resolveRange("7d", {}, midday)).toMatchObject({
      from: "2026-10-21",
      to: "2026-10-27",
      days: 7,
    });
    expect(resolveRange("30d", {}, midday)).toMatchObject({ from: "2026-09-28", days: 30 });
    expect(resolveRange("month", {}, midday)).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-27",
    });
    expect(resolveRange("last-month", {}, midday)).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-30",
      days: 30,
    });
  });

  it("accepts a sensible custom range and rejects the rest", () => {
    expect(resolveRange("custom", { from: "2026-01-01", to: "2026-01-31" }, midday)).toMatchObject({
      preset: "custom",
      days: 31,
    });
    expect(resolveRange("custom", { from: "2026-02-01", to: "2026-01-01" }, midday).preset).toBe(
      "30d",
    );
    expect(resolveRange("custom", { from: "2024-01-01", to: "2026-01-01" }, midday).preset).toBe(
      "30d",
    );
    expect(resolveRange("custom", { from: "nope", to: null }, midday).preset).toBe("30d");
  });

  it("picks the month to file", () => {
    expect(resolveMonth(null, midday)).toBe("2026-09");
    expect(resolveMonth("2026-10", midday)).toBe("2026-10");
    expect(resolveMonth("2026-11", midday)).toBe("2026-09");
    expect(resolveMonth("2026-13", midday)).toBe("2026-09");
    expect(recentMonths(3, midday)).toEqual(["2026-10", "2026-09", "2026-08"]);
    expect(recentMonths(2, new Date("2026-01-10T06:00:00Z"))).toEqual(["2026-01", "2025-12"]);
  });

  it("formats", () => {
    expect(formatMonth("2026-09")).toBe("September 2026");
    expect(formatRange("2026-10-01", "2026-10-27")).toBe("1 Oct – 27 Oct 2026");
    expect(formatRange("2025-12-20", "2026-01-05")).toBe("20 Dec 2025 – 5 Jan 2026");
  });
});
