import { RETURN_TO_PARAM, safeReturnTo } from "@/config/routes";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Read and sanitise the `?next=` return path. Returns undefined when absent or unsafe. */
export async function readReturnTo(searchParams: SearchParams): Promise<string | undefined> {
  const raw = (await searchParams)[RETURN_TO_PARAM];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  const safe = safeReturnTo(value, "");
  return safe || undefined;
}
