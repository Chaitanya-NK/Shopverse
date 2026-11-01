"use client";

import { useEffect } from "react";

/** The browser bar takes the shop's colour (the app's own theme-color tags are reused). */
export function ThemeColor({ color }: { color: string }) {
  useEffect(() => {
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    const previous = metas.map((m) => m.content);
    for (const m of metas) m.content = color;
    return () => metas.forEach((m, i) => (m.content = previous[i]!));
  }, [color]);
  return null;
}
