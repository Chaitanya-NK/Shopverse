import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { makeTranslate } from "@/i18n/core";
import { hi } from "@/i18n/hi";
import { INDIRECT_TEXT } from "@/i18n/indirect";

/** Every t("…"), t.plural(…, "…", "…") and <T>…</T> in the source. */
function usedKeys(): Map<string, string> {
  const files: string[] = [];
  (function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && !name.includes(".test.")) files.push(path);
    }
  })("src");
  const str = String.raw`"((?:[^"\\]|\\.)*)"`;
  const patterns = [
    new RegExp(String.raw`\bt\(\s*` + str, "g"),
    new RegExp(String.raw`\bt\.plural\([^,]+,\s*` + str + String.raw`,\s*` + str, "g"),
    new RegExp(String.raw`<T(?: vars=\{\{[^}]*\}\})?>\{\s*` + str + String.raw`\s*\}</T>`, "g"),
    /<T(?: vars=\{\{[^}]*\}\})?>([^<{]+)<\/T>/g,
  ];
  const keys = new Map<string, string>();
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    if (!/useT|getT|translator|Translate|<T[ >]/.test(source)) continue;
    for (const re of patterns)
      for (const m of source.matchAll(re))
        for (const g of m.slice(1))
          if (g !== undefined) {
            const key =
              re.source.startsWith("<T") && !re.source.includes("\\{")
                ? g.trim()
                : JSON.parse(`"${g}"`);
            if (/[A-Za-z]/.test(key)) keys.set(key, file);
          }
  }
  return keys;
}

describe("Hindi storefront", () => {
  it("translates every string the storefront uses", () => {
    const missing = [...usedKeys()].filter(([key]) => !(key in hi)).map(([k, f]) => `${f}: ${k}`);
    expect(missing).toEqual([]);
  });

  it("translates status labels and default headings", () => {
    expect(INDIRECT_TEXT.filter((k) => !(k in hi))).toEqual([]);
  });

  it("keeps every placeholder and tag", () => {
    const tokens = (s: string) => [...s.matchAll(/\{\w+\}|<\/?b>/g)].map((m) => m[0]).sort();
    const broken = Object.entries(hi).filter(([en, h]) => tokens(en).join() !== tokens(h).join());
    expect(broken).toEqual([]);
  });

  it("fills placeholders and falls back to English", () => {
    const t = makeTranslate("hi", hi);
    expect(t("Only {count} left", { count: 3 })).toBe("सिर्फ़ 3 बचे हैं");
    expect(t.plural(1, "{count} item", "{count} items")).toBe("1 आइटम");
    expect(t("Something nobody translated")).toBe("Something nobody translated");
  });
});
