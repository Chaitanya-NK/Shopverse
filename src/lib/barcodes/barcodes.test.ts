import { describe, expect, it } from "vitest";

import { code128Values, code128Widths, PATTERNS } from "@/lib/barcodes/code128";
import { ean13CheckDigit, ean13Modules, normalizeEan13 } from "@/lib/barcodes/ean13";

/** Read the widths back into text, as a scanner would. */
function decode128(widths: number[]): string {
  const values: number[] = [];
  let i = 0;
  while (i < widths.length) {
    const size = widths.length - i === 7 ? 7 : 6;
    const chunk = widths.slice(i, i + size).join("");
    const value = PATTERNS.indexOf(chunk as (typeof PATTERNS)[number]);
    if (value < 0) throw new Error(`bad symbol ${chunk}`);
    values.push(value);
    i += size;
  }
  expect(values.at(-1)).toBe(106);
  const data = values.slice(0, -2);
  const check = data.reduce((s, v, idx) => s + v * (idx === 0 ? 1 : idx), 0) % 103;
  expect(values.at(-2)).toBe(check);
  let set = data[0] === 105 ? "C" : "B";
  let out = "";
  for (const v of data.slice(1)) {
    if (v === 99) set = "C";
    else if (v === 100) set = "B";
    else out += set === "C" ? String(v).padStart(2, "0") : String.fromCharCode(v + 32);
  }
  return out;
}

describe("code 128", () => {
  it.each(["SVT1234567890", "PO-000123", "TEE-M", "12345678", "A1", "123", "Classic tee / L", "9"])(
    "round-trips %s",
    (text) => {
      const widths = code128Widths(text);
      // Every symbol is 11 modules; the stop is 13.
      expect(widths.reduce((a, b) => a + b, 0)).toBe(11 * (code128Values(text).length - 1) + 13);
      expect(decode128(widths)).toBe(text);
    },
  );

  it("packs long digit runs into subset C", () => {
    expect(code128Values("12345678")).toHaveLength(4 + 3);
    expect(code128Values("SVT1234567890")[0]).toBe(104);
    expect(code128Values("SVT1234567890")).toContain(99);
  });

  it("rejects what it can't encode", () => {
    expect(() => code128Values("")).toThrow();
    expect(() => code128Values("café")).toThrow();
  });
});

describe("EAN-13", () => {
  it("computes and checks the check digit", () => {
    expect(ean13CheckDigit("400638133393")).toBe(1);
    expect(normalizeEan13("4006381333931")).toBe("4006381333931");
    expect(normalizeEan13("4006381333932")).toBeNull();
    // UPC-A 036000291452 is EAN-13 0036000291452.
    expect(normalizeEan13("036000291452")).toBe("0036000291452");
    expect(normalizeEan13("SKU-1")).toBeNull();
  });

  it("encodes 95 modules with guards", () => {
    const m = ean13Modules("4006381333931");
    expect(m).toHaveLength(95);
    expect(m.startsWith("101")).toBe(true);
    expect(m.slice(45, 50)).toBe("01010");
    expect(m.endsWith("101")).toBe(true);
  });
});
