import { z } from "zod";

import {
  defaultSettings,
  type FieldDef,
  newId,
  settingsSchema,
  type Settings,
} from "@/features/design/fields";
import { FONT_OPTIONS } from "@/features/design/fonts";
import {
  mainSectionOf,
  SECTION_TYPES,
  SECTIONS,
  type SectionType,
  TEMPLATE_KEYS,
  type TemplateKey,
} from "@/features/design/sections";

export const MAX_SECTIONS = 30;
export const MAX_PAGES = 20;
export const RESERVED_PAGE_HANDLES = ["shipping", "returns", "privacy", "terms"] as const;
export const PAGE_HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

// ---------------------------------------------------------------------------
// Style, header and footer: described as fields, like section settings.
// ---------------------------------------------------------------------------
export const STYLE_FIELDS = [
  {
    kind: "select",
    key: "headingFont",
    label: "Headings",
    options: FONT_OPTIONS,
    default: "geist",
  },
  { kind: "select", key: "bodyFont", label: "Text", options: FONT_OPTIONS, default: "geist" },
  {
    kind: "select",
    key: "corners",
    label: "Corners",
    options: [
      { value: "sharp", label: "Sharp" },
      { value: "soft", label: "Slightly rounded" },
      { value: "rounded", label: "Rounded" },
      { value: "round", label: "Very rounded" },
    ],
    default: "rounded",
  },
  {
    kind: "select",
    key: "cardStyle",
    label: "Product cards",
    options: [
      { value: "plain", label: "Plain" },
      { value: "bordered", label: "Outlined" },
      { value: "shadow", label: "Raised" },
    ],
    default: "plain",
  },
  {
    kind: "select",
    key: "imageRatio",
    label: "Product photo shape",
    options: [
      { value: "square", label: "Square" },
      { value: "portrait", label: "Portrait (3:4)" },
      { value: "landscape", label: "Landscape (4:3)" },
    ],
    default: "square",
  },
  {
    kind: "select",
    key: "columns",
    label: "Products per row (large screens)",
    options: [
      { value: "3", label: "3" },
      { value: "4", label: "4" },
      { value: "5", label: "5" },
    ],
    default: "4",
  },
  {
    kind: "select",
    key: "width",
    label: "Page width",
    options: [
      { value: "narrow", label: "Narrow" },
      { value: "normal", label: "Normal" },
      { value: "wide", label: "Wide" },
    ],
    default: "normal",
  },
] as const satisfies readonly FieldDef[];

const MENU_FIELD = {
  kind: "list",
  key: "menu",
  label: "Menu",
  itemLabel: "link",
  max: 8,
  summary: "label",
  fields: [
    { kind: "text", key: "label", label: "Label", max: 30 },
    { kind: "link", key: "link", label: "Goes to" },
  ],
} as const satisfies FieldDef;

export const HEADER_FIELDS = [
  {
    kind: "select",
    key: "layout",
    label: "Layout",
    options: [
      { value: "classic", label: "Logo left, search in the middle" },
      { value: "centered", label: "Logo in the centre" },
      { value: "minimal", label: "Compact, menu beside the logo" },
    ],
    default: "classic",
  },
  {
    kind: "select",
    key: "search",
    label: "Search",
    options: [
      { value: "bar", label: "Search bar" },
      { value: "icon", label: "Search button" },
      { value: "none", label: "No search" },
    ],
    default: "bar",
  },
  { kind: "toggle", key: "sticky", label: "Stays at the top while scrolling", default: true },
  {
    kind: "toggle",
    key: "showAnnouncement",
    label: "Announcement bar",
    help: "The text is set in the shop's settings.",
    default: true,
  },
  MENU_FIELD,
] as const satisfies readonly FieldDef[];

export const SOCIAL_NETWORKS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "youtube", label: "YouTube" },
  { value: "x", label: "X" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "pinterest", label: "Pinterest" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "other", label: "Website" },
] as const;

export const FOOTER_FIELDS = [
  {
    kind: "select",
    key: "layout",
    label: "Layout",
    options: [
      { value: "columns", label: "Columns" },
      { value: "simple", label: "Simple, centred" },
    ],
    default: "columns",
  },
  {
    kind: "textarea",
    key: "about",
    label: "About the shop",
    max: 300,
    rows: 3,
    help: "Leave empty to use the shop's tagline.",
  },
  {
    kind: "text",
    key: "note",
    label: "Small print",
    max: 120,
    default: "Cash on delivery across India.",
  },
  { kind: "text", key: "menuHeading", label: "Menu heading", max: 30, default: "Shop" },
  MENU_FIELD,
  { kind: "toggle", key: "showPolicies", label: "Help and legal links", default: true },
  { kind: "toggle", key: "showContact", label: "Email and phone", default: true },
  {
    kind: "list",
    key: "social",
    label: "Social links",
    itemLabel: "social link",
    max: 8,
    summary: "network",
    fields: [
      { kind: "select", key: "network", label: "Network", options: SOCIAL_NETWORKS },
      { kind: "link", key: "link", label: "Address", help: "Full https:// address." },
    ],
  },
] as const satisfies readonly FieldDef[];

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------
export type Section = { id: string; type: SectionType; hidden: boolean; settings: Settings };
export type CustomPage = {
  id: string;
  handle: string;
  title: string;
  description: string;
  showTitle: boolean;
  sections: Section[];
};
export type Design = {
  version: 1;
  preset: string;
  style: Settings;
  header: Settings;
  footer: Settings;
  templates: Record<TemplateKey, { sections: Section[] }>;
  pages: CustomPage[];
};

const sectionSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(40)
      .catch(() => newId()),
    type: z.enum(SECTION_TYPES as [SectionType, ...SectionType[]]),
    hidden: z.boolean().catch(false),
    settings: z.unknown(),
  })
  .transform((s): Section => ({
    ...s,
    settings: settingsSchema(SECTIONS[s.type].fields).parse(s.settings ?? {}),
  }));

/** Sections, dropping any that can't be read (an unknown type, say). */
const sectionsSchema = z
  .array(z.unknown())
  .catch([])
  .transform((list) =>
    list.slice(0, MAX_SECTIONS).flatMap((s) => {
      const parsed = sectionSchema.safeParse(s);
      return parsed.success ? [parsed.data] : [];
    }),
  );

const pageSchema = z.object({
  id: z.string().min(1).max(40),
  handle: z.string().regex(PAGE_HANDLE_PATTERN),
  title: z.string().trim().min(1).max(80),
  description: z.string().max(200).catch(""),
  showTitle: z.boolean().catch(true),
  sections: sectionsSchema,
});

/** Make a section list valid for its page: one main section, nothing out of place. */
export function tidySections(sections: Section[], template: TemplateKey | "page"): Section[] {
  const seen = new Set<SectionType>();
  const ids = new Set<string>();
  const out: Section[] = [];
  for (const section of sections) {
    const def = SECTIONS[section.type] as { only?: readonly string[]; single?: boolean };
    if (def.only && !def.only.includes(template)) continue;
    if (def.single && seen.has(section.type)) continue;
    seen.add(section.type);
    const id = ids.has(section.id) ? newId() : section.id;
    ids.add(id);
    out.push(id === section.id ? section : { ...section, id });
  }
  if (template === "page") return out;
  const main = mainSectionOf(template);
  if (main && !seen.has(main)) out.push(newSection(main));
  // The template's own content is never hidden.
  return out.map((s) => (main && s.type === main && s.hidden ? { ...s, hidden: false } : s));
}

export function newSection(type: SectionType, settings: Settings = {}): Section {
  return {
    id: newId(),
    type,
    hidden: false,
    settings: { ...defaultSettings(SECTIONS[type].fields), ...settings },
  };
}

/**
 * Read a stored design. Lenient: unknown sections are dropped and odd values
 * fall back to defaults, so a design always renders. `fallback` fills in
 * whatever is missing (for templates a design doesn't have yet).
 */
export function parseDesign(raw: unknown, fallback: Design): Design {
  const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const templatesRaw = (
    typeof obj.templates === "object" && obj.templates !== null ? obj.templates : {}
  ) as Record<string, { sections?: unknown } | undefined>;

  const templates = Object.fromEntries(
    TEMPLATE_KEYS.map((key) => {
      const stored = templatesRaw[key];
      const sections = stored
        ? sectionsSchema.parse(stored.sections)
        : fallback.templates[key].sections;
      return [key, { sections: tidySections(sections, key) }];
    }),
  ) as Design["templates"];

  const handles = new Set<string>();
  const pages = (Array.isArray(obj.pages) ? obj.pages : []).slice(0, MAX_PAGES).flatMap((p) => {
    const parsed = pageSchema.safeParse(p);
    if (!parsed.success) return [];
    const page = parsed.data;
    if ((RESERVED_PAGE_HANDLES as readonly string[]).includes(page.handle)) return [];
    if (handles.has(page.handle)) return [];
    handles.add(page.handle);
    return [{ ...page, sections: tidySections(page.sections, "page") }];
  });

  return {
    version: 1,
    preset: typeof obj.preset === "string" ? obj.preset.slice(0, 40) : fallback.preset,
    style: settingsSchema(STYLE_FIELDS).parse(obj.style ?? fallback.style),
    header: settingsSchema(HEADER_FIELDS).parse(obj.header ?? fallback.header),
    footer: settingsSchema(FOOTER_FIELDS).parse(obj.footer ?? fallback.footer),
    templates,
    pages,
  };
}

/** Problems that stop a draft being saved (shown to the person editing). */
export function designProblems(design: Design): string[] {
  const problems: string[] = [];
  const handles = new Set<string>();
  for (const page of design.pages) {
    if (!page.title.trim()) problems.push("Every page needs a title.");
    if (!PAGE_HANDLE_PATTERN.test(page.handle))
      problems.push(
        `“${page.handle || page.title}”: page addresses use lowercase letters, numbers and dashes.`,
      );
    else if ((RESERVED_PAGE_HANDLES as readonly string[]).includes(page.handle))
      problems.push(`“/pages/${page.handle}” is taken by the shop's ${page.handle} policy.`);
    else if (handles.has(page.handle)) problems.push(`Two pages use “/pages/${page.handle}”.`);
    handles.add(page.handle);
  }
  if (design.pages.length > MAX_PAGES) problems.push(`A shop can have up to ${MAX_PAGES} pages.`);
  const lists = [
    ...TEMPLATE_KEYS.map((k) => design.templates[k].sections),
    ...design.pages.map((p) => p.sections),
  ];
  if (lists.some((l) => l.length > MAX_SECTIONS))
    problems.push(`A page can have up to ${MAX_SECTIONS} sections.`);
  return problems;
}

export function sectionsOf(design: Design, target: string): Section[] | null {
  if (target.startsWith("page:"))
    return design.pages.find((p) => `page:${p.id}` === target)?.sections ?? null;
  return design.templates[target as TemplateKey]?.sections ?? null;
}
