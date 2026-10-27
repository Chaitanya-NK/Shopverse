import { describe, expect, it } from "vitest";

import { parseIsoDate, toIsoDate } from "@/components/shared/date-picker";

describe("date picker values", () => {
  it("round-trips without a timezone shift", () => {
    for (const value of ["2026-01-01", "2026-10-27", "2027-03-31", "2024-02-29"])
      expect(toIsoDate(parseIsoDate(value)!)).toBe(value);
  });

  it("reads the local calendar day", () => {
    const d = parseIsoDate("2026-10-27")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 27]);
  });

  it("ignores empty or malformed values", () => {
    expect(parseIsoDate("")).toBeUndefined();
    expect(parseIsoDate(null)).toBeUndefined();
    expect(parseIsoDate("27/10/2026")).toBeUndefined();
  });
});
