import { describe, expect, it } from "vitest";

import {
  brandTheme,
  brandThemeCss,
  contrastRatio,
  DEFAULT_BRAND_COLOR,
  hexToRgb,
} from "@/features/branding/theme";

describe("brand theme", () => {
  it("measures contrast like WCAG", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 1);
    expect(hexToRgb("#1D6B5C")).toEqual([29, 107, 92]);
  });

  it("puts white text on dark colours and dark text on light ones", () => {
    expect(brandTheme("#1d6b5c").primaryForeground).toBe("#ffffff");
    expect(brandTheme("#facc15")).toMatchObject({ primaryForeground: "#111111", readable: true });
  });

  it("darkens colours too pale to see on a white page", () => {
    const t = brandTheme("#fef9c3");
    expect(t.primary).not.toBe("#fef9c3");
    expect(contrastRatio(t.primary, "#ffffff")).toBeGreaterThanOrEqual(3);
    expect(t.readable).toBe(true);
  });

  it("falls back to the default for missing or invalid colours", () => {
    expect(brandTheme(null).primary).toBe(DEFAULT_BRAND_COLOR);
    expect(brandTheme("red").primary).toBe(DEFAULT_BRAND_COLOR);
  });

  it("emits only safe CSS", () => {
    expect(brandThemeCss(brandTheme("#2563EB"))).toBe(
      ":root,.dark{--primary:#2563eb;--primary-foreground:#ffffff;--ring:#2563eb;--sidebar-primary:#2563eb;}",
    );
  });
});
