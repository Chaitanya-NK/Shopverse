import { type Banner } from "@/features/branding/schemas";
import { defaultSettings, newId, type Settings } from "@/features/design/fields";
import { shopLinks } from "@/features/design/links";
import {
  type Design,
  FOOTER_FIELDS,
  HEADER_FIELDS,
  newSection,
  type Section,
  STYLE_FIELDS,
} from "@/features/design/schema";

/** What a starting layout needs to know about the shop. */
export type PresetContext = {
  name: string;
  tagline: string | null;
  /** "Free delivery over ₹999", "Delivery ₹49" or "Free delivery". */
  deliveryNote: string;
  banners: Banner[];
  collections: { slug: string; title: string }[];
  categories: { id: string; name: string }[];
};

export const PRESETS = {
  classic: {
    label: "Classic",
    description: "Banner or headline, homepage collections, then everything you sell.",
  },
  bold: {
    label: "Bold",
    description:
      "A big statement, best sellers, your story and a newsletter. Square corners, strong type.",
  },
  minimal: {
    label: "Minimal",
    description: "Calm and editorial: serif headings, lots of space, fewer products at a time.",
  },
  catalogue: {
    label: "Catalogue",
    description:
      "For shops with lots of products: category buttons, best sellers and filters up front.",
  },
} as const;
export type PresetId = keyof typeof PRESETS;

function item(settings: Settings): Settings {
  return { id: newId(), ...settings };
}

function slidesFrom(banners: Banner[]): Settings[] {
  return banners.map((b) =>
    item({
      image: { path: b.path, width: b.width, height: b.height },
      headline: b.headline,
      subtext: b.subtext,
      buttonLabel: "",
      link: b.link,
      alt: b.alt,
    }),
  );
}

function promises(ctx: PresetContext): Settings[] {
  return [
    item({ icon: "truck", title: ctx.deliveryNote, text: "Delivered across India" }),
    item({ icon: "cod", title: "Cash on delivery", text: "Pay when your order arrives" }),
    item({
      icon: "returns",
      title: "Easy returns",
      text: "Ask for a return from your orders page",
    }),
    item({
      icon: "shield",
      title: "Safe hand-over",
      text: "Parcels are handed over only with your code",
    }),
  ];
}

function banner(ctx: PresetContext, hero: Settings = {}): Section {
  return ctx.banners.length > 0
    ? newSection("slideshow", { slides: slidesFrom(ctx.banners) })
    : newSection("hero", {
        heading: ctx.name,
        text: ctx.tagline ?? "",
        buttonLabel: "",
        link: "",
        ...hero,
      });
}

function collectionMenu(ctx: PresetContext, limit: number): Settings[] {
  return [
    ...ctx.collections
      .slice(0, limit)
      .map((c) => item({ label: c.title.slice(0, 30), link: shopLinks.collection(c.slug) })),
    item({ label: "All products", link: shopLinks.products }),
  ];
}

function standardTemplates(): Omit<Design["templates"], "home"> {
  return {
    catalogue: { sections: [newSection("catalogue")] },
    collection: { sections: [newSection("collection-main")] },
    product: {
      sections: [
        newSection("product-main"),
        newSection("product-reviews"),
        newSection("related-products"),
      ],
    },
    cart: { sections: [newSection("cart-main")] },
  };
}

function base(
  preset: PresetId,
  style: Settings,
  header: Settings,
  footer: Settings,
): Omit<Design, "templates"> {
  return {
    version: 1,
    preset,
    style: { ...defaultSettings(STYLE_FIELDS), ...style },
    header: { ...defaultSettings(HEADER_FIELDS), ...header },
    footer: { ...defaultSettings(FOOTER_FIELDS), ...footer },
    pages: [],
  };
}

/** A complete design in one of the starting layouts. */
export function presetDesign(preset: PresetId, ctx: PresetContext): Design {
  switch (preset) {
    case "classic":
      return {
        ...base("classic", {}, {}, {}),
        templates: {
          home: {
            sections: [
              banner(ctx),
              newSection("featured-collection", { collection: "auto" }),
              newSection("catalogue"),
            ],
          },
          ...standardTemplates(),
        },
      };
    case "bold":
      return {
        ...base(
          "bold",
          {
            headingFont: "space-grotesk",
            bodyFont: "dm-sans",
            corners: "sharp",
            cardStyle: "bordered",
            imageRatio: "portrait",
            width: "wide",
          },
          { layout: "centered", search: "icon", menu: collectionMenu(ctx, 4) },
          { menu: collectionMenu(ctx, 5) },
        ),
        templates: {
          home: {
            sections: [
              banner(ctx, {
                height: "large",
                align: "center",
                buttonLabel: "Shop now",
                link: shopLinks.products,
              }),
              newSection("promises", { style: "strip", items: promises(ctx) }),
              newSection("product-grid", {
                heading: "Best sellers",
                source: "bestselling",
                count: "4",
              }),
              newSection("featured-collection", { collection: "auto", layout: "row", count: "8" }),
              newSection("image-with-text", {
                heading: `Why ${ctx.name}`,
                text: "Tell shoppers what makes your products different: how they're made, where they come from, who they're for.",
                buttonLabel: "Browse everything",
                link: shopLinks.products,
                background: "muted",
              }),
              newSection("reviews"),
              newSection("newsletter", { background: "brand" }),
            ],
          },
          ...standardTemplates(),
        },
      };
    case "minimal":
      return {
        ...base(
          "minimal",
          {
            headingFont: "fraunces",
            bodyFont: "geist",
            corners: "soft",
            imageRatio: "portrait",
            columns: "3",
            width: "narrow",
          },
          { layout: "minimal", search: "icon", menu: collectionMenu(ctx, 3) },
          { layout: "simple" },
        ),
        templates: {
          home: {
            sections: [
              newSection("rich-text", {
                eyebrow: ctx.name.slice(0, 40),
                heading: (ctx.tagline ?? `Welcome to ${ctx.name}`).slice(0, 80),
                text: "",
                buttonLabel: "Shop the collection",
                link: shopLinks.products,
                align: "center",
              }),
              newSection("featured-collection", { collection: "auto", count: "6" }),
              newSection("product-grid", { heading: "New arrivals", source: "newest", count: "6" }),
              newSection("brand-story", {
                heading: `About ${ctx.name}`,
                text: "Share where the shop started, what you care about and who's behind it.",
              }),
            ],
          },
          ...standardTemplates(),
        },
      };
    case "catalogue":
      return {
        ...base(
          "catalogue",
          {
            headingFont: "dm-sans",
            bodyFont: "dm-sans",
            corners: "soft",
            cardStyle: "shadow",
            columns: "5",
            width: "wide",
          },
          {
            menu: [
              ...ctx.categories
                .slice(0, 6)
                .map((c) => item({ label: c.name.slice(0, 30), link: shopLinks.category(c.id) })),
              ...(ctx.collections[0]
                ? [
                    item({
                      label: ctx.collections[0].title.slice(0, 30),
                      link: shopLinks.collection(ctx.collections[0].slug),
                    }),
                  ]
                : []),
            ],
          },
          {},
        ),
        templates: {
          home: {
            sections: [
              banner(ctx, { height: "small" }),
              newSection("shop-by", { heading: "Shop by category", style: "chips", items: [] }),
              newSection("promises", { style: "cards", items: promises(ctx) }),
              newSection("product-grid", {
                heading: "Best sellers",
                source: "bestselling",
                count: "8",
                layout: "row",
              }),
              newSection("product-grid", { heading: "On sale", source: "sale", count: "4" }),
              newSection("catalogue"),
            ],
          },
          ...standardTemplates(),
        },
      };
  }
}

/** What a shop looks like before anyone designs it: the classic layout. */
export function defaultDesign(ctx: PresetContext): Design {
  return presetDesign("classic", ctx);
}
