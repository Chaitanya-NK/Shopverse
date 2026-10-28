import { describe, expect, it } from "vitest";

import { csvCell, csvFilename, toCsv } from "@/features/analytics/csv";

describe("csv", () => {
  it("neutralises spreadsheet formulas", () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell("+1+cmd|' /C calc'!A0")).toBe("'+1+cmd|' /C calc'!A0");
    expect(csvCell("+91 98765")).toBe("'+91 98765");
    // A plain international phone number stays readable.
    expect(csvCell("+919876543210")).toBe("+919876543210");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell("@sum")).toBe("'@sum");
    // Real numbers stay numbers, negatives included.
    expect(csvCell(-12.5)).toBe("-12.5");
  });

  it("quotes commas, quotes and new lines", () => {
    expect(csvCell("Pune, MH")).toBe('"Pune, MH"');
    expect(csvCell('5" frame')).toBe('"5"" frame"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(Number.NaN)).toBe("");
    expect(csvCell(true)).toBe("Yes");
  });

  it("builds a file with a BOM and CRLF", () => {
    expect(toCsv(["A", "B"], [[1, "x"]])).toBe("﻿A,B\r\n1,x\r\n");
  });

  it("makes safe file names", () => {
    expect(csvFilename("Orders", "2026-10-01", "../etc")).toBe("orders-2026-10-01-etc.csv");
    expect(csvFilename("", "")).toBe("export.csv");
  });
});
