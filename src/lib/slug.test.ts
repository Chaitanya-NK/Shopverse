import { describe, expect, it } from "vitest";

import { SLUG_PATTERN, slugify, toWarehouseCode } from "./slug";

describe("slugify", () => {
  it.each([
    ["Urban Threads", "urban-threads"],
    ["Urban Threads & Co.", "urban-threads-and-co"],
    ["  Café   Déjà Vu  ", "cafe-deja-vu"],
    ["Loom---Co", "loom-co"],
    ["UPPER_case 123", "upper-case-123"],
  ])("%s -> %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("never ends with a dash after truncation", () => {
    const slug = slugify(`${"a".repeat(47)} b`);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug.length).toBeLessThanOrEqual(48);
  });

  it("produces slugs the database accepts", () => {
    for (const name of ["Urban Threads Retail", "Kiddo Toys", "Masala Box Foods 2"]) {
      expect(SLUG_PATTERN.test(slugify(name))).toBe(true);
    }
  });
});

describe("toWarehouseCode", () => {
  it.each([
    ["Bengaluru", "BENGALURU"],
    ["Navi Mumbai", "NAVI"],
    ["Thiruvananthapuram", "THIRUVANANTH"],
    ["x", "MAIN"],
    ["", "MAIN"],
  ])("%s -> %s", (input, expected) => {
    expect(toWarehouseCode(input)).toBe(expected);
  });
});
