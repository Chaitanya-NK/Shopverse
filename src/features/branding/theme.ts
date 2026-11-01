/**
 * Turning a shop's brand colour into theme colours that stay readable.
 * Contrast follows WCAG 2.x: 4.5:1 for normal text, 3:1 for large text and
 * interface parts like button outlines.
 */

export const DEFAULT_BRAND_COLOR = "#1d6b5c";
export const BRAND_PRESETS = [
  "#1d6b5c",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#111827",
] as const;

const HEX = /^#([0-9a-f]{6})$/i;

export function isHexColor(value: string): boolean {
  return HEX.test(value);
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = HEX.exec(hex);
  if (!m) throw new Error(`Not a hex colour: ${hex}`);
  const n = Number.parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channel(c: number) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(channel) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = "#ffffff";
const INK = "#111111";

/** Mix a colour towards black (amount 0–1). */
function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex).map((c) => Math.round(c * (1 - amount)));
  return `#${[r, g, b].map((c) => c!.toString(16).padStart(2, "0")).join("")}`;
}

export type BrandTheme = {
  /** Buttons, badges and the announcement bar. */
  primary: string;
  /** Text on primary. */
  primaryForeground: string;
  /** Focus rings. */
  ring: string;
  /** How well primary reads as text/buttons on a white page. */
  contrastOnWhite: number;
  /** Primary and its text: at least 4.5:1. */
  readable: boolean;
};

/**
 * The storefront theme for a brand colour. Text on buttons is white or near-
 * black, whichever contrasts more. A colour too pale to stand out against the
 * white page is darkened until it reaches 3:1, so buttons stay visible.
 */
export function brandTheme(color: string | null | undefined): BrandTheme {
  let primary = color && isHexColor(color) ? color.toLowerCase() : DEFAULT_BRAND_COLOR;
  for (let i = 0; i < 20 && contrastRatio(primary, WHITE) < 3; i++) primary = darken(primary, 0.08);
  const onWhite = contrastRatio(WHITE, primary);
  const onInk = contrastRatio(INK, primary);
  const primaryForeground = onWhite >= onInk ? WHITE : INK;
  return {
    primary,
    primaryForeground,
    ring: primary,
    contrastOnWhite: Math.round(contrastRatio(primary, WHITE) * 100) / 100,
    readable: Math.max(onWhite, onInk) >= 4.5,
  };
}

/** CSS that applies the theme to the whole page (light and dark). */
export function brandThemeCss(theme: BrandTheme): string {
  const vars = `--primary:${theme.primary};--primary-foreground:${theme.primaryForeground};--ring:${theme.ring};--sidebar-primary:${theme.primary};`;
  return `:root,.dark{${vars}}`;
}
