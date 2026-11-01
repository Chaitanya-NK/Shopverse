import { describe, expect, it } from "vitest";

import { isValidLink, isValidVideo, parseVideo, settingsSchema } from "@/features/design/fields";
import { shopHref } from "@/features/design/links";
import { defaultDesign, PRESETS, presetDesign, type PresetId } from "@/features/design/presets";
import { designProblems, newSection, parseDesign, tidySections } from "@/features/design/schema";
import { allowedOn, mainSectionOf, SECTIONS, TEMPLATE_KEYS } from "@/features/design/sections";
import { designCss } from "@/features/design/style";

const ctx = {
  name: "Urban Threads",
  tagline: "Everyday style",
  deliveryNote: "Free delivery over ₹999",
  banners: [],
  collections: [{ slug: "summer", title: "Summer" }],
  categories: [{ id: "4f1d2a3b-0000-4000-8000-000000000001", name: "Clothing" }],
};
const IMAGE = {
  path: "11111111-1111-4111-8111-111111111111/shops/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333",
  width: 1920,
  height: 640,
};

describe("links", () => {
  it.each([
    ["/", true],
    ["/c/summer", true],
    ["/products?category=x", true],
    ["https://instagram.com/shop", true],
    ["", true],
    ["javascript:alert(1)", false],
    ["//evil.example", false],
    ["/\\evil.example", false],
    ["http://insecure.example", false],
    ["data:text/html,hi", false],
    ["/a b", false],
  ])("%s valid: %s", (link, ok) => expect(isValidLink(link)).toBe(ok));

  it("resolves links inside the shop", () => {
    expect(shopHref("urban", "/")).toBe("/s/urban");
    expect(shopHref("urban", "/c/summer")).toBe("/s/urban/c/summer");
    expect(shopHref("urban", "/s/urban/p/tee")).toBe("/s/urban/p/tee");
    expect(shopHref("urban", "https://x.example/a")).toBe("https://x.example/a");
    expect(shopHref("urban", "javascript:alert(1)")).toBeNull();
    expect(shopHref("urban", "")).toBeNull();
  });
});

describe("videos", () => {
  it("reads YouTube and Vimeo links", () => {
    expect(parseVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      id: "dQw4w9WgXcQ",
    });
    expect(parseVideo("https://youtu.be/dQw4w9WgXcQ?t=3")).toEqual({
      provider: "youtube",
      id: "dQw4w9WgXcQ",
    });
    expect(parseVideo("https://www.youtube.com/shorts/abcdef12345")).toEqual({
      provider: "youtube",
      id: "abcdef12345",
    });
    expect(parseVideo("https://vimeo.com/76979871")).toEqual({ provider: "vimeo", id: "76979871" });
  });
  it("rejects anything else", () => {
    expect(parseVideo("https://evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseVideo("https://www.youtube.com/watch?v=<script>")).toBeNull();
    expect(isValidVideo("http://youtube.com/watch?v=dQw4w9WgXcQ")).toBe(false);
  });
});

describe("settings", () => {
  const fields = SECTIONS.slideshow.fields;
  it("falls back to defaults for odd values", () => {
    const parsed = settingsSchema(fields).parse({ height: "giant", slides: "nope" });
    expect(parsed).toEqual({ height: "medium", slides: [] });
  });
  it("cleans list items: bad links and foreign images go, text is trimmed to size", () => {
    const parsed = settingsSchema(fields).parse({
      slides: [
        { image: IMAGE, headline: "x".repeat(200), link: "javascript:alert(1)" },
        { image: { path: "../../etc/passwd", width: 1, height: 1 }, headline: "Two" },
      ],
    });
    const slides = parsed.slides as Record<string, unknown>[];
    expect(slides).toHaveLength(2);
    expect((slides[0]!.headline as string).length).toBe(80);
    expect(slides[0]!.link).toBe("");
    expect(slides[0]!.image).toEqual(IMAGE);
    expect(slides[1]!.image).toBeNull();
    expect(typeof slides[1]!.id).toBe("string");
  });
  it("keeps at most the list's maximum", () => {
    const parsed = settingsSchema(fields).parse({ slides: Array.from({ length: 9 }, () => ({})) });
    expect(parsed.slides).toHaveLength(5);
  });
});

describe("design documents", () => {
  it("every starting layout is valid and complete", () => {
    for (const id of Object.keys(PRESETS) as PresetId[]) {
      const design = presetDesign(id, ctx);
      expect(designProblems(design)).toEqual([]);
      for (const t of TEMPLATE_KEYS) {
        const main = mainSectionOf(t);
        if (main && t !== "home")
          expect(design.templates[t].sections.some((s) => s.type === main)).toBe(true);
      }
      // A stored design reads back the same.
      expect(parseDesign(JSON.parse(JSON.stringify(design)), defaultDesign(ctx))).toEqual(design);
    }
  });

  it("drops unknown sections and fills in missing templates", () => {
    const parsed = parseDesign(
      {
        templates: {
          home: {
            sections: [
              { id: "a", type: "marquee", settings: {} },
              { id: "b", type: "hero", settings: { heading: "Hi" } },
            ],
          },
        },
        pages: [{ id: "p", handle: "shipping", title: "Clash", sections: [] }],
      },
      defaultDesign(ctx),
    );
    expect(parsed.templates.home.sections.map((s) => s.type)).toEqual(["hero"]);
    expect(parsed.templates.product.sections.map((s) => s.type)).toContain("product-main");
    expect(parsed.pages).toEqual([]);
  });

  it("keeps each template's own content: added back, one only, never hidden, nothing out of place", () => {
    const cart = tidySections(
      [
        { ...newSection("cart-main"), hidden: true },
        newSection("cart-main"),
        newSection("product-main"),
      ],
      "cart",
    );
    expect(cart.map((s) => s.type)).toEqual(["cart-main"]);
    expect(cart[0]!.hidden).toBe(false);
    expect(tidySections([newSection("faq")], "collection").map((s) => s.type)).toEqual([
      "faq",
      "collection-main",
    ]);
    expect(allowedOn("product-main", "home")).toBe(false);
    expect(allowedOn("catalogue", "page:x")).toBe(true);
  });

  it("reports page problems", () => {
    const design = defaultDesign(ctx);
    design.pages = [
      { id: "1", handle: "about", title: "About", description: "", showTitle: true, sections: [] },
      { id: "2", handle: "about", title: "Copy", description: "", showTitle: true, sections: [] },
      { id: "3", handle: "Bad Handle", title: "", description: "", showTitle: true, sections: [] },
    ];
    expect(designProblems(design)).toHaveLength(3);
  });

  it("CSS comes only from fixed choices", () => {
    const css = designCss({
      headingFont: "fraunces;}body{display:none",
      corners: "sharp",
      columns: "99",
      cardStyle: "shadow",
    });
    expect(css).not.toContain("display:none");
    expect(css).toContain("--radius:0rem");
    expect(css).toContain("repeat(4,");
    expect(css).toContain("--font-geist-sans");
    expect(css).toContain("box-shadow");
  });
});
