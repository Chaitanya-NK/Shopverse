import { describe, expect, it } from "vitest";

import { formatMoney, formatNumber, initials } from "./format";

describe("initials", () => {
  it.each([
    ["Urban Threads Retail", "UT"],
    ["priya@urbanthreads.in", "PU"],
    ["Loom", "LO"],
    ["   ", "?"],
  ])("%s -> %s", (input, expected) => {
    expect(initials(input)).toBe(expected);
  });
});

describe("formatMoney", () => {
  it("uses Indian digit grouping for INR", () => {
    expect(formatMoney(123456)).toBe("₹1,23,456");
    // Paise only when there are any.
    expect(formatMoney(947.2)).toBe("₹947.20");
    expect(formatMoney(99.8)).toBe("₹99.80");
  });

  it("formats other currencies", () => {
    expect(formatMoney(1500, "USD")).toBe("$1,500");
  });
});

describe("formatNumber", () => {
  it("groups thousands the Indian way", () => {
    expect(formatNumber(4812000)).toBe("48,12,000");
  });
});
