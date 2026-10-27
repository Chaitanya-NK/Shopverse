/** Mirrors the database CHECK constraint on organizations.slug and shops.slug. */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;
export const SLUG_MAX_LENGTH = 48;

/**
 * "Urban Threads & Co." -> "urban-threads-co".
 * Strips accents, collapses separators and trims to the database limit.
 */
export function slugify(input: string, maxLength = SLUG_MAX_LENGTH): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

/** Mirrors warehouses.code: 2–12 chars of A–Z, 0–9 and dashes. "Bengaluru WH" -> "BENGALURU". */
export function toWarehouseCode(input: string): string {
  const code = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")[0]
    ?.slice(0, 12);
  return code && code.length >= 2 ? code : "MAIN";
}
