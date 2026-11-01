import { FONTS, type FontId } from "@/features/design/fonts";
import { type Settings } from "@/features/design/fields";

const RADIUS = { sharp: "0rem", soft: "0.375rem", rounded: "0.625rem", round: "1rem" } as const;
const RATIO = { square: "1 / 1", portrait: "3 / 4", landscape: "4 / 3" } as const;
const WIDTH = { narrow: "64rem", normal: "72rem", wide: "80rem" } as const;

function pick<T extends Record<string, string>>(map: T, value: unknown, fallback: keyof T): string {
  return typeof value === "string" && value in map ? map[value]! : map[fallback]!;
}

/**
 * CSS for a shop's style choices. Values come only from the fixed tables
 * above, never from free text, so nothing a shop types ends up in CSS.
 */
export function designCss(style: Settings): string {
  const heading =
    FONTS[(style.headingFont as FontId) in FONTS ? (style.headingFont as FontId) : "geist"].stack;
  const body =
    FONTS[(style.bodyFont as FontId) in FONTS ? (style.bodyFont as FontId) : "geist"].stack;
  const columns = ["3", "4", "5"].includes(style.columns as string)
    ? (style.columns as string)
    : "4";
  const card =
    style.cardStyle === "bordered"
      ? ".sv-card{border:1px solid var(--border);background:var(--card);border-radius:var(--radius-2xl);padding:.5rem .5rem .75rem}"
      : style.cardStyle === "shadow"
        ? ".sv-card{background:var(--card);border-radius:var(--radius-2xl);padding:.5rem .5rem .75rem;box-shadow:0 1px 2px rgb(0 0 0/.05),0 10px 28px -14px rgb(0 0 0/.22)}"
        : "";
  return [
    `:root{--radius:${pick(RADIUS, style.corners, "rounded")};--sv-ratio:${pick(RATIO, style.imageRatio, "square")};` +
      `--sv-width:${pick(WIDTH, style.width, "normal")};--sv-cols:repeat(${columns},minmax(0,1fr));` +
      `--sv-heading:${heading};--sv-body:${body}}`,
    "body.font-sans{font-family:var(--sv-body)}",
    "h1,h2,h3,.sv-heading{font-family:var(--sv-heading)}",
    card,
  ].join("");
}
