import {
  AlignLeftIcon,
  BookOpenIcon,
  CircleHelpIcon,
  GalleryHorizontalIcon,
  GiftIcon,
  GridIcon,
  ImageIcon,
  type LucideIcon,
  LayoutGridIcon,
  LayoutPanelLeftIcon,
  ListIcon,
  MailIcon,
  MapPinIcon,
  MessageSquareQuoteIcon,
  PackageIcon,
  PanelTopIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  SparklesIcon,
  StarIcon,
  TimerIcon,
  VideoIcon,
  type LucideProps,
} from "lucide-react";

import { type FieldDef, type Option } from "@/features/design/fields";

/** The page templates a design lays out (custom pages are separate). */
export const TEMPLATES = {
  home: { label: "Home page", description: "The first page shoppers see." },
  catalogue: {
    label: "All products & search",
    description: "Search results, categories and the full catalogue.",
  },
  collection: { label: "Collection pages", description: "Every collection uses this layout." },
  product: { label: "Product pages", description: "Every product uses this layout." },
  cart: { label: "Cart", description: "The shopping cart." },
} as const;
export type TemplateKey = keyof typeof TEMPLATES;
export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];
/** Where a section list lives: a template, or a custom page (by id). */
export type PageTarget = TemplateKey | `page:${string}`;

export const SECTION_GROUPS = {
  catalogue: "Products & catalogue",
  content: "Content",
  marketing: "Trust & marketing",
  story: "Brand story",
  page: "This page",
} as const;
export type SectionGroup = keyof typeof SECTION_GROUPS;

const COUNT = (values: number[]): Option[] =>
  values.map((n) => ({ value: String(n), label: String(n) }));
const LAYOUT_OPTIONS: Option[] = [
  { value: "grid", label: "Grid" },
  { value: "row", label: "Scrolling row" },
];
const BACKGROUND_OPTIONS: Option[] = [
  { value: "none", label: "None" },
  { value: "muted", label: "Soft grey" },
  { value: "brand", label: "Brand colour" },
];
const ALIGN_OPTIONS: Option[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Centre" },
];
const SIDE_OPTIONS: Option[] = [
  { value: "left", label: "Image on the left" },
  { value: "right", label: "Image on the right" },
];
const heading = (fallback = ""): FieldDef => ({
  kind: "text",
  key: "heading",
  label: "Heading",
  max: 80,
  default: fallback,
});
const button: FieldDef[] = [
  {
    kind: "text",
    key: "buttonLabel",
    label: "Button text",
    max: 30,
    help: "Leave empty for no button.",
  },
  { kind: "link", key: "link", label: "Button link" },
];

export type SectionDef = {
  label: string;
  description: string;
  group: SectionGroup;
  icon: LucideIcon | React.ComponentType<LucideProps>;
  fields: readonly FieldDef[];
  /** Only on these templates (custom pages count as "page"). Default: anywhere. */
  only?: readonly (TemplateKey | "page")[];
  /** The template's own content: always there once, can be moved but not removed. */
  main?: TemplateKey;
  /** At most once per page. */
  single?: boolean;
};

export const SECTIONS = {
  // ---------------------------------------------------------------- catalogue
  slideshow: {
    label: "Slideshow",
    description: "Up to 5 wide images with a headline and link; shoppers swipe between them.",
    group: "catalogue",
    icon: GalleryHorizontalIcon,
    fields: [
      {
        kind: "select",
        key: "height",
        label: "Height",
        options: [
          { value: "small", label: "Short" },
          { value: "medium", label: "Medium" },
          { value: "large", label: "Tall" },
        ],
        default: "medium",
      },
      {
        kind: "list",
        key: "slides",
        label: "Slides",
        itemLabel: "slide",
        max: 5,
        summary: "headline",
        fields: [
          {
            kind: "image",
            key: "image",
            label: "Image",
            help: "Wide images work best, about 1920 × 640.",
          },
          { kind: "text", key: "headline", label: "Headline", max: 80 },
          { kind: "text", key: "subtext", label: "Text", max: 160 },
          ...button,
          {
            kind: "text",
            key: "alt",
            label: "Image description",
            max: 200,
            help: "Read aloud by screen readers.",
          },
        ],
      },
    ],
  },
  hero: {
    label: "Hero",
    description: "A big headline with a button, on your brand colour or an image.",
    group: "catalogue",
    icon: PanelTopIcon,
    fields: [
      heading("Welcome"),
      { kind: "textarea", key: "text", label: "Text", max: 240, rows: 3 },
      ...button,
      {
        kind: "image",
        key: "image",
        label: "Background image",
        help: "Optional. Text sits on a dark overlay.",
      },
      { kind: "select", key: "align", label: "Text alignment", options: ALIGN_OPTIONS },
      {
        kind: "select",
        key: "height",
        label: "Height",
        options: [
          { value: "small", label: "Short" },
          { value: "medium", label: "Medium" },
          { value: "large", label: "Tall" },
        ],
        default: "medium",
      },
      {
        kind: "toggle",
        key: "showDelivery",
        label: "Show delivery and cash on delivery note",
        default: true,
      },
    ],
  },
  "featured-collection": {
    label: "Featured collection",
    description: "Products from one collection, or every collection marked for the homepage.",
    group: "catalogue",
    icon: LayoutGridIcon,
    fields: [
      {
        kind: "collection",
        key: "collection",
        label: "Collection",
        allowAuto: true,
        help: "“Homepage collections” shows each collection with “Show on the homepage” turned on.",
      },
      {
        kind: "text",
        key: "heading",
        label: "Heading",
        max: 80,
        help: "Leave empty to use the collection's name.",
      },
      {
        kind: "select",
        key: "count",
        label: "Products",
        options: COUNT([3, 4, 6, 8, 9, 12]),
        default: "4",
      },
      { kind: "select", key: "layout", label: "Layout", options: LAYOUT_OPTIONS },
      { kind: "toggle", key: "showAll", label: "Show “See all” link", default: true },
    ],
  },
  "product-grid": {
    label: "Product list",
    description: "Best sellers, new arrivals, top rated, on sale or a category.",
    group: "catalogue",
    icon: GridIcon,
    fields: [
      heading("Best sellers"),
      {
        kind: "select",
        key: "source",
        label: "Show",
        options: [
          { value: "bestselling", label: "Best sellers" },
          { value: "newest", label: "New arrivals" },
          { value: "rating", label: "Top rated" },
          { value: "sale", label: "On sale" },
          { value: "category", label: "A category" },
        ],
      },
      {
        kind: "category",
        key: "category",
        label: "Category",
        help: "Used when “Show” is a category.",
      },
      {
        kind: "select",
        key: "count",
        label: "Products",
        options: COUNT([3, 4, 6, 8, 9, 12]),
        default: "4",
      },
      { kind: "select", key: "layout", label: "Layout", options: LAYOUT_OPTIONS },
      { kind: "toggle", key: "showAll", label: "Show “View all” link", default: true },
    ],
  },
  "shop-by": {
    label: "Shop by category",
    description: "Tiles or buttons for categories and collections.",
    group: "catalogue",
    icon: LayoutPanelLeftIcon,
    fields: [
      heading("Shop by category"),
      {
        kind: "select",
        key: "style",
        label: "Style",
        options: [
          { value: "tiles", label: "Image tiles" },
          { value: "chips", label: "Buttons" },
        ],
      },
      {
        kind: "list",
        key: "items",
        label: "Tiles",
        itemLabel: "tile",
        max: 12,
        summary: "label",
        fields: [
          { kind: "category", key: "category", label: "Category" },
          { kind: "collection", key: "collection", label: "…or a collection" },
          {
            kind: "text",
            key: "label",
            label: "Label",
            max: 40,
            help: "Leave empty to use the name.",
          },
          { kind: "image", key: "image", label: "Image", help: "Optional." },
        ],
      },
    ],
  },
  catalogue: {
    label: "All products",
    description: "The full catalogue with category buttons, filters, sorting and pages.",
    group: "catalogue",
    icon: ShoppingBagIcon,
    main: "catalogue",
    single: true,
    only: ["home", "catalogue", "page"],
    fields: [
      { kind: "text", key: "heading", label: "Heading", max: 80, default: "All products" },
      { kind: "toggle", key: "showCategories", label: "Category buttons", default: true },
      { kind: "toggle", key: "showFilters", label: "Price and stock filters", default: true },
      { kind: "toggle", key: "showSort", label: "Sorting", default: true },
    ],
  },
  // ------------------------------------------------------------------ content
  "image-with-text": {
    label: "Image with text",
    description: "A picture beside a heading, text and a button.",
    group: "content",
    icon: ImageIcon,
    fields: [
      { kind: "image", key: "image", label: "Image" },
      heading("Made to last"),
      { kind: "textarea", key: "text", label: "Text", max: 1000, rows: 5 },
      ...button,
      { kind: "select", key: "side", label: "Layout", options: SIDE_OPTIONS },
      { kind: "select", key: "background", label: "Background", options: BACKGROUND_OPTIONS },
    ],
  },
  "rich-text": {
    label: "Text",
    description: "A heading and paragraphs, with an optional button.",
    group: "content",
    icon: AlignLeftIcon,
    fields: [
      { kind: "text", key: "eyebrow", label: "Small text above", max: 40 },
      heading("About us"),
      {
        kind: "textarea",
        key: "text",
        label: "Text",
        max: 3000,
        rows: 6,
        help: "Leave a blank line between paragraphs.",
      },
      ...button,
      {
        kind: "select",
        key: "align",
        label: "Alignment",
        options: ALIGN_OPTIONS,
        default: "center",
      },
      { kind: "select", key: "background", label: "Background", options: BACKGROUND_OPTIONS },
    ],
  },
  video: {
    label: "Video",
    description: "A YouTube or Vimeo video. It loads only when the shopper presses play.",
    group: "content",
    icon: VideoIcon,
    fields: [
      heading(),
      { kind: "video", key: "video", label: "YouTube or Vimeo link" },
      { kind: "text", key: "caption", label: "Caption", max: 200 },
      {
        kind: "image",
        key: "poster",
        label: "Cover image",
        help: "Optional. Shown before the video plays.",
      },
    ],
  },
  gallery: {
    label: "Image gallery",
    description: "Up to 12 pictures in a grid, each with an optional caption and link.",
    group: "content",
    icon: LayoutGridIcon,
    fields: [
      heading(),
      {
        kind: "select",
        key: "columns",
        label: "Per row",
        options: COUNT([2, 3, 4]),
        default: "3",
      },
      {
        kind: "select",
        key: "ratio",
        label: "Shape",
        options: [
          { value: "square", label: "Square" },
          { value: "portrait", label: "Portrait" },
          { value: "landscape", label: "Landscape" },
        ],
      },
      {
        kind: "list",
        key: "images",
        label: "Pictures",
        itemLabel: "picture",
        max: 12,
        summary: "caption",
        fields: [
          { kind: "image", key: "image", label: "Image" },
          { kind: "text", key: "caption", label: "Caption", max: 120 },
          { kind: "link", key: "link", label: "Link" },
          { kind: "text", key: "alt", label: "Image description", max: 200 },
        ],
      },
    ],
  },
  faq: {
    label: "Questions & answers",
    description: "Frequently asked questions that open one at a time.",
    group: "content",
    icon: CircleHelpIcon,
    fields: [
      heading("Questions & answers"),
      { kind: "textarea", key: "intro", label: "Introduction", max: 300, rows: 2 },
      {
        kind: "list",
        key: "items",
        label: "Questions",
        itemLabel: "question",
        max: 20,
        summary: "question",
        fields: [
          { kind: "text", key: "question", label: "Question", max: 200 },
          { kind: "textarea", key: "answer", label: "Answer", max: 1500, rows: 4 },
        ],
      },
    ],
  },
  // ---------------------------------------------------------------- marketing
  reviews: {
    label: "Customer reviews",
    description: "Your best reviews from verified buyers, with the product they bought.",
    group: "marketing",
    icon: MessageSquareQuoteIcon,
    fields: [
      heading("What customers say"),
      {
        kind: "select",
        key: "minRating",
        label: "Show reviews with",
        options: [
          { value: "4", label: "4 stars and up" },
          { value: "5", label: "5 stars only" },
        ],
      },
      { kind: "select", key: "count", label: "Reviews", options: COUNT([3, 6, 9]), default: "3" },
    ],
  },
  promises: {
    label: "Promises",
    description: "Short reasons to buy: delivery, cash on delivery, returns and more.",
    group: "marketing",
    icon: ShieldCheckIcon,
    fields: [
      {
        kind: "select",
        key: "style",
        label: "Style",
        options: [
          { value: "strip", label: "Strip" },
          { value: "cards", label: "Cards" },
        ],
      },
      {
        kind: "list",
        key: "items",
        label: "Promises",
        itemLabel: "promise",
        max: 4,
        summary: "title",
        fields: [
          { kind: "icon", key: "icon", label: "Icon" },
          { kind: "text", key: "title", label: "Title", max: 60 },
          { kind: "text", key: "text", label: "Text", max: 140 },
        ],
      },
    ],
  },
  countdown: {
    label: "Offer countdown",
    description: "A timer to the end of a sale. It hides itself when the time is up.",
    group: "marketing",
    icon: TimerIcon,
    fields: [
      heading("Festive sale ends soon"),
      { kind: "text", key: "text", label: "Text", max: 200 },
      { kind: "datetime", key: "endsAt", label: "Ends at", help: "In India time." },
      ...button,
      {
        kind: "select",
        key: "background",
        label: "Background",
        options: BACKGROUND_OPTIONS.filter((o) => o.value !== "none"),
        default: "brand",
      },
    ],
  },
  newsletter: {
    label: "Newsletter sign-up",
    description: "Collect email addresses. Find them under Marketing.",
    group: "marketing",
    icon: MailIcon,
    single: true,
    fields: [
      heading("Get first dibs on new arrivals"),
      {
        kind: "text",
        key: "text",
        label: "Text",
        max: 240,
        default: "Offers and new products, about once a month.",
      },
      { kind: "text", key: "buttonLabel", label: "Button text", max: 30, default: "Sign up" },
      {
        kind: "select",
        key: "background",
        label: "Background",
        options: BACKGROUND_OPTIONS,
        default: "muted",
      },
    ],
  },
  // -------------------------------------------------------------------- story
  "brand-story": {
    label: "Our story",
    description: "Who you are, with a picture and a few numbers to be proud of.",
    group: "story",
    icon: BookOpenIcon,
    fields: [
      { kind: "text", key: "eyebrow", label: "Small text above", max: 40, default: "Our story" },
      heading("Made with care"),
      { kind: "textarea", key: "text", label: "Story", max: 2000, rows: 6 },
      { kind: "image", key: "image", label: "Image" },
      { kind: "select", key: "side", label: "Layout", options: SIDE_OPTIONS, default: "right" },
      {
        kind: "list",
        key: "stats",
        label: "Highlights",
        itemLabel: "highlight",
        max: 4,
        summary: "value",
        fields: [
          { kind: "text", key: "value", label: "Number", max: 20, placeholder: "10,000+" },
          { kind: "text", key: "label", label: "Label", max: 60, placeholder: "Happy customers" },
        ],
      },
    ],
  },
  locations: {
    label: "Stores & contact",
    description: "Your shops or pickup points, with hours, phone and a map link.",
    group: "story",
    icon: MapPinIcon,
    fields: [
      heading("Visit us"),
      {
        kind: "list",
        key: "items",
        label: "Places",
        itemLabel: "place",
        max: 6,
        summary: "name",
        fields: [
          { kind: "text", key: "name", label: "Name", max: 80 },
          { kind: "textarea", key: "address", label: "Address", max: 300, rows: 3 },
          {
            kind: "text",
            key: "hours",
            label: "Opening hours",
            max: 120,
            placeholder: "Mon–Sat, 10am–8pm",
          },
          { kind: "text", key: "phone", label: "Phone", max: 20 },
          {
            kind: "link",
            key: "link",
            label: "Map link",
            help: "For example a Google Maps https:// link.",
          },
        ],
      },
      { kind: "toggle", key: "showContact", label: "Show “Contact us” button", default: true },
    ],
  },
  "social-grid": {
    label: "Social feed",
    description: "A grid of square pictures linking to your social profile.",
    group: "story",
    icon: SparklesIcon,
    fields: [
      heading("Follow along"),
      { kind: "text", key: "handle", label: "Handle", max: 60, placeholder: "@urbanthreads" },
      {
        kind: "link",
        key: "link",
        label: "Profile link",
        help: "https:// address of your profile.",
      },
      {
        kind: "list",
        key: "images",
        label: "Pictures",
        itemLabel: "picture",
        max: 9,
        fields: [
          { kind: "image", key: "image", label: "Image" },
          { kind: "text", key: "alt", label: "Image description", max: 200 },
        ],
      },
    ],
  },
  // --------------------------------------------------------- template content
  "product-main": {
    label: "Product details",
    description: "Photos, price, options, add to cart and the product's details.",
    group: "page",
    icon: PackageIcon,
    main: "product",
    single: true,
    only: ["product"],
    fields: [
      {
        kind: "select",
        key: "gallery",
        label: "Photos",
        options: [
          { value: "left", label: "Photos on the left" },
          { value: "right", label: "Photos on the right" },
        ],
      },
      { kind: "toggle", key: "showBreadcrumb", label: "Back link to the category", default: true },
      { kind: "toggle", key: "showPromises", label: "Delivery and payment box", default: true },
      { kind: "toggle", key: "showDescription", label: "Description", default: true },
      { kind: "toggle", key: "showDetails", label: "Details table", default: true },
    ],
  },
  "product-reviews": {
    label: "Product reviews",
    description: "Ratings and reviews of the product, with the review form for buyers.",
    group: "page",
    icon: StarIcon,
    single: true,
    only: ["product"],
    fields: [],
  },
  "related-products": {
    label: "Related products",
    description: "“You may also like”: same category, tags or collections.",
    group: "page",
    icon: GiftIcon,
    single: true,
    only: ["product"],
    fields: [
      heading("You may also like"),
      {
        kind: "select",
        key: "count",
        label: "Products",
        options: COUNT([3, 4, 6, 8]),
        default: "4",
      },
      { kind: "select", key: "layout", label: "Layout", options: LAYOUT_OPTIONS },
    ],
  },
  "collection-main": {
    label: "Collection products",
    description: "The collection's title, description and products.",
    group: "page",
    icon: ListIcon,
    main: "collection",
    single: true,
    only: ["collection"],
    fields: [
      { kind: "toggle", key: "showDescription", label: "Description", default: true },
      { kind: "toggle", key: "showCount", label: "Number of products", default: true },
      { kind: "toggle", key: "showSort", label: "Sorting", default: true },
    ],
  },
  "cart-main": {
    label: "Cart",
    description: "The shopper's items, order summary and checkout button.",
    group: "page",
    icon: ShoppingCartIcon,
    main: "cart",
    single: true,
    only: ["cart"],
    fields: [
      { kind: "text", key: "heading", label: "Heading", max: 60, default: "Your cart" },
      { kind: "toggle", key: "showDiscount", label: "Discount code field", default: true },
      {
        kind: "toggle",
        key: "showFreeDelivery",
        label: "“Add more for free delivery” hint",
        default: true,
      },
    ],
  },
} as const satisfies Record<string, SectionDef>;

export type SectionType = keyof typeof SECTIONS;
export const SECTION_TYPES = Object.keys(SECTIONS) as SectionType[];

export function sectionDef(type: SectionType): SectionDef {
  return SECTIONS[type];
}

/** Can this section go on that page? */
export function allowedOn(type: SectionType, target: PageTarget): boolean {
  const def: SectionDef = SECTIONS[type];
  if (!def.only) return true;
  return def.only.includes(target.startsWith("page:") ? "page" : (target as TemplateKey));
}

/** The section a template can't do without. */
export function mainSectionOf(template: TemplateKey): SectionType | null {
  return SECTION_TYPES.find((t) => (SECTIONS[t] as SectionDef).main === template) ?? null;
}

/** Whether a section can be removed from a page (a template's own content can't). */
export function isRequired(type: SectionType, target: PageTarget): boolean {
  return (SECTIONS[type] as SectionDef).main === target;
}
