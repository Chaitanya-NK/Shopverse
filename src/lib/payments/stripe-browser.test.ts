import { describe, expect, it } from "vitest";

import { googleFontFor, luminance } from "./stripe-browser";

describe("Stripe field styling", () => {
  it("serves the page's font to Stripe's frame from Google Fonts", () => {
    expect(
      googleFontFor("'DM Sans Variable', 'Noto Sans Devanagari Variable', sans-serif"),
    ).toEqual({
      family: "DM Sans",
      cssSrc: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap",
    });
    expect(googleFontFor('"Playfair Display Variable", serif')?.family).toBe("Playfair Display");
    // next/font names Geist "__Geist_abc123"; Geist Mono stays mono.
    expect(googleFontFor("__Geist_abc123, __Geist_Fallback_abc123")?.family).toBe("Geist");
    expect(googleFontFor("'Geist Mono', monospace")?.family).toBe("Geist Mono");
  });

  it("leaves fonts it doesn't know to the browser", () => {
    expect(googleFontFor("ui-sans-serif, system-ui")).toBeNull();
    expect(googleFontFor("")).toBeNull();
  });

  it("tells light from dark backgrounds", () => {
    expect(luminance([255, 255, 255])).toBeCloseTo(1);
    expect(luminance([0, 0, 0])).toBe(0);
    expect(luminance([10, 10, 10])).toBeLessThan(0.2);
    expect(luminance([250, 250, 250])).toBeGreaterThan(0.2);
  });
});
