import { describe, expect, it } from "vitest";

import { toCsv } from "@/features/analytics/csv";
import { CsvParseError, parseCsv, parseCsvRecords } from "@/lib/csv-parse";

describe("parseCsv", () => {
  it("reads quoted fields with commas, quotes and line breaks", () => {
    expect(parseCsv('a,b,c\r\n"x, y","say ""hi""","two\nlines"\r\n')).toEqual([
      ["a", "b", "c"],
      ["x, y", 'say "hi"', "two\nlines"],
    ]);
  });

  it("handles LF endings, a BOM, blank lines and a missing final newline", () => {
    expect(parseCsv("﻿a,b\n\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps empty cells", () => {
    expect(parseCsv("a,,c\n,,")).toEqual([
      ["a", "", "c"],
      ["", "", ""],
    ]);
  });

  it("rejects an unclosed quote", () => {
    expect(() => parseCsv('a\n"open')).toThrow(CsvParseError);
  });

  it("round-trips our own export, including formula-escaped text", () => {
    const csv = toCsv(
      ["Title", "Price"],
      [
        ["=SUM(A1)", 10],
        ['Kurta, "blue"', 499.5],
      ],
    );
    const { records } = parseCsvRecords(csv);
    expect(records).toEqual([
      { title: "=SUM(A1)", price: "10" },
      { title: 'Kurta, "blue"', price: "499.5" },
    ]);
  });
});
