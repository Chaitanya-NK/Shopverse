/** Shops whose unpublished design this browser is previewing (comma-separated ids). */
export const DESIGN_PREVIEW_COOKIE = "sv_design_preview";
export const DESIGN_PREVIEW_MAX_AGE = 60 * 60 * 8;

/** Messages between the design editor and the storefront in its preview frame. */
export type PreviewMessage =
  | { source: "shopverse-editor"; type: "refresh" }
  | { source: "shopverse-editor"; type: "select"; sectionId: string | null }
  | { source: "shopverse-preview"; type: "select"; sectionId: string }
  | { source: "shopverse-preview"; type: "location"; path: string };
