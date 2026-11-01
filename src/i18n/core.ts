/**
 * Storefront translations. English text is the key: code reads naturally,
 * and anything without a translation shows in English. Placeholders look
 * like {name}. A test checks every t("…") in the code has a Hindi entry.
 */
export const LOCALES = ["en", "hi"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", hi: "हिन्दी" };
/** For Intl (dates, numbers). */
export const INTL_LOCALE: Record<Locale, string> = { en: "en-IN", hi: "hi-IN" };
export const LOCALE_COOKIE = "sv_lang";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export type Vars = Record<string, string | number>;
export type Dictionary = Record<string, string>;

export type Translate = {
  (text: string, vars?: Vars): string;
  /** "{count} item" / "{count} items" by count. */
  plural: (count: number, one: string, other: string, vars?: Vars) => string;
  locale: Locale;
};

function fill(text: string, vars?: Vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

export function makeTranslate(locale: Locale, dictionary: Dictionary | null): Translate {
  const t = ((text: string, vars?: Vars) => fill(dictionary?.[text] ?? text, vars)) as Translate;
  t.plural = (count, one, other, vars) => t(count === 1 ? one : other, { count, ...vars });
  t.locale = locale;
  return t;
}
