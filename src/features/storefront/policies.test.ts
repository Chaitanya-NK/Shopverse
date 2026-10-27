import { describe, expect, it } from "vitest";

import { isStorefrontPolicy, toParagraphs } from "@/features/storefront/policies";

describe("policies", () => {
  it("splits on blank lines and keeps single line breaks", () => {
    expect(toParagraphs("One\r\nline two\n\n\n  Two  \n \nThree")).toEqual([
      "One\nline two",
      "Two",
      "Three",
    ]);
  });
  it("knows its pages", () => {
    expect(isStorefrontPolicy("returns")).toBe(true);
    expect(isStorefrontPolicy("__proto__")).toBe(false);
  });
});
