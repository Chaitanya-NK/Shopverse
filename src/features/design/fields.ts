import { z } from "zod";

/**
 * Settings are described once, as fields. The same description drives the
 * editor's forms and the parser that reads stored designs, so the two can't
 * drift apart.
 */

type Base = { key: string; label: string; help?: string };
export type Option = { value: string; label: string };

export type FieldDef =
  | (Base & { kind: "text"; max: number; placeholder?: string; default?: string })
  | (Base & {
      kind: "textarea";
      max: number;
      rows?: number;
      placeholder?: string;
      default?: string;
    })
  | (Base & { kind: "select"; options: readonly Option[]; default?: string })
  | (Base & { kind: "toggle"; default?: boolean })
  | (Base & { kind: "image" })
  | (Base & { kind: "link"; default?: string })
  | (Base & { kind: "collection"; allowAuto?: boolean })
  | (Base & { kind: "category" })
  | (Base & { kind: "datetime" })
  | (Base & { kind: "video" })
  | (Base & { kind: "icon"; default?: string })
  | (Base & {
      kind: "list";
      itemLabel: string;
      max: number;
      fields: readonly FieldDef[];
      /** Key of the item field shown as each item's title in the editor. */
      summary?: string;
    });

export type Settings = Record<string, unknown>;

export const ICON_OPTIONS = [
  { value: "truck", label: "Delivery truck" },
  { value: "cod", label: "Cash" },
  { value: "returns", label: "Returns" },
  { value: "shield", label: "Shield" },
  { value: "gift", label: "Gift" },
  { value: "clock", label: "Clock" },
  { value: "phone", label: "Phone" },
  { value: "leaf", label: "Leaf" },
  { value: "star", label: "Star" },
  { value: "award", label: "Award" },
  { value: "heart", label: "Heart" },
  { value: "sparkles", label: "Sparkles" },
  { value: "store", label: "Shop" },
  { value: "pin", label: "Location" },
] as const satisfies readonly Option[];

/** An uploaded image: <org>/shops/<shop>/<id>, stored as WebP in two widths. */
export const designImageSchema = z.object({
  path: z.string().regex(/^[0-9a-f-]{36}\/shops\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type DesignImage = z.output<typeof designImageSchema>;

/** A page in the shop ("/p/tee", "/c/sale", "/") or an https page. */
export function isValidLink(value: string): boolean {
  if (value === "") return true;
  if (value.length > 300 || /\s/.test(value)) return false;
  return /^\/([^/\\]|$)/.test(value) || /^https:\/\/[^\s/]+\.[^\s]+/.test(value);
}

const VIDEO_PATTERN = /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com)\/\S{1,200}$/;
export function isValidVideo(value: string): boolean {
  return value === "" || VIDEO_PATTERN.test(value);
}

/** The video to embed for a YouTube or Vimeo page (null when unrecognised). */
export function parseVideo(url: string): { provider: "youtube" | "vimeo"; id: string } | null {
  if (!VIDEO_PATTERN.test(url)) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^(www|m)\./, "");
  if (host === "youtu.be") {
    const id = parsed.pathname.slice(1).split("/")[0] ?? "";
    return /^[\w-]{6,20}$/.test(id) ? { provider: "youtube", id } : null;
  }
  if (host === "youtube.com") {
    const id =
      parsed.searchParams.get("v") ??
      parsed.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/)?.[1] ??
      "";
    return /^[\w-]{6,20}$/.test(id) ? { provider: "youtube", id } : null;
  }
  if (host === "vimeo.com") {
    const id = parsed.pathname.match(/^\/(?:video\/)?(\d{5,12})/)?.[1];
    return id ? { provider: "vimeo", id } : null;
  }
  return null;
}

export function fieldDefault(field: FieldDef): unknown {
  switch (field.kind) {
    case "text":
    case "textarea":
      return field.default ?? "";
    case "select":
      return field.default ?? field.options[0]?.value ?? "";
    case "toggle":
      return field.default ?? false;
    case "image":
      return null;
    case "link":
      return field.default ?? "";
    case "collection":
      return field.allowAuto ? "auto" : "";
    case "icon":
      return field.default ?? "truck";
    case "list":
      return [];
    default:
      return "";
  }
}

export function defaultSettings(fields: readonly FieldDef[]): Settings {
  return Object.fromEntries(fields.map((f) => [f.key, fieldDefault(f)]));
}

const uuidOrEmpty = z.union([z.uuid(), z.literal("")]);

/**
 * The schema for one field. Lenient: anything unexpected falls back to the
 * default, so an old or hand-edited design still renders.
 */
function fieldSchema(field: FieldDef): z.ZodType<unknown> {
  const fallback = fieldDefault(field);
  switch (field.kind) {
    case "text":
    case "textarea":
      return z
        .string()
        .transform((v) => v.slice(0, field.max))
        .catch(fallback as string);
    case "select": {
      const values = field.options.map((o) => o.value);
      return z
        .string()
        .refine((v) => values.includes(v))
        .catch(fallback as string);
    }
    case "toggle":
      return z.boolean().catch(fallback as boolean);
    case "image":
      return designImageSchema.nullable().catch(null);
    case "link":
      return z
        .string()
        .trim()
        .refine(isValidLink)
        .catch(fallback as string);
    case "video":
      return z.string().trim().refine(isValidVideo).catch("");
    case "collection":
      return (field.allowAuto ? z.union([z.literal("auto"), uuidOrEmpty]) : uuidOrEmpty).catch(
        fallback as string,
      );
    case "category":
      return uuidOrEmpty.catch("");
    case "datetime":
      return z
        .string()
        .refine((v) => v === "" || !Number.isNaN(Date.parse(v)))
        .catch("");
    case "icon":
      return z
        .string()
        .refine((v) => ICON_OPTIONS.some((o) => o.value === v))
        .catch(fallback as string);
    case "list":
      return z
        .array(z.unknown())
        .catch([])
        .transform((items) =>
          items
            .filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null)
            .slice(0, field.max)
            .map((item) => ({
              ...settingsSchema(field.fields).parse(item),
              id: typeof item.id === "string" && item.id.length <= 40 ? item.id : newId(),
            })),
        );
  }
}

export function settingsSchema(fields: readonly FieldDef[]) {
  return z
    .record(z.string(), z.unknown())
    .catch({})
    .transform((raw) =>
      Object.fromEntries(fields.map((f) => [f.key, fieldSchema(f).parse(raw[f.key])])),
    );
}

/** What's wrong with a value as typed, for inline hints in the editor. */
export function fieldProblem(field: FieldDef, value: unknown): string | null {
  if (field.kind === "link" && typeof value === "string" && !isValidLink(value.trim()))
    return "Use a page in your shop (starting with /) or a full https:// address.";
  if (field.kind === "video" && typeof value === "string" && value && !parseVideo(value.trim()))
    return "Paste a YouTube or Vimeo link.";
  return null;
}

/** Short ids for sections and list items. */
export function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}
