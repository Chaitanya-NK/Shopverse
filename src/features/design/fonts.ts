/**
 * Typefaces a shop can choose. Geist is the app's own font; the others are
 * open-source fonts bundled with the storefront (only the ones a page uses
 * are downloaded).
 */
export const FONTS = {
  geist: {
    label: "Geist (modern)",
    stack: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  },
  "dm-sans": {
    label: "DM Sans (clean)",
    stack: "'DM Sans Variable', ui-sans-serif, system-ui, sans-serif",
  },
  "space-grotesk": {
    label: "Space Grotesk (bold)",
    stack: "'Space Grotesk Variable', ui-sans-serif, system-ui, sans-serif",
  },
  nunito: {
    label: "Nunito (friendly)",
    stack: "'Nunito Variable', ui-rounded, ui-sans-serif, sans-serif",
  },
  fraunces: {
    label: "Fraunces (editorial serif)",
    stack: "'Fraunces Variable', ui-serif, Georgia, serif",
  },
  playfair: {
    label: "Playfair Display (elegant serif)",
    stack: "'Playfair Display Variable', ui-serif, Georgia, serif",
  },
  lora: { label: "Lora (book serif)", stack: "'Lora Variable', ui-serif, Georgia, serif" },
  mono: {
    label: "Geist Mono (technical)",
    stack: "var(--font-geist-mono), ui-monospace, monospace",
  },
} as const;
export type FontId = keyof typeof FONTS;
export const FONT_OPTIONS = Object.entries(FONTS).map(([value, f]) => ({ value, label: f.label }));
