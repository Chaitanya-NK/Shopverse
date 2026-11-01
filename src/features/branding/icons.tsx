import "server-only";

import { ImageResponse } from "next/og";
import sharp from "sharp";

import { brandTheme } from "@/features/branding/theme";
import { initials } from "@/lib/format";
import { logger } from "@/lib/logger";

export const ICON_SIZES = [180, 192, 512] as const;
export type IconSize = (typeof ICON_SIZES)[number];

const PNG_HEADERS = {
  "content-type": "image/png",
  "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
};

/**
 * A square app icon: the logo on white with a safe margin (so launchers that
 * crop to a circle keep it whole), or the name's initials on the brand colour.
 */
export async function appIcon(input: {
  name: string;
  color: string | null;
  logoUrl: string | null;
  size: IconSize;
}): Promise<Response> {
  if (input.logoUrl) {
    try {
      const res = await fetch(input.logoUrl, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`logo ${res.status}`);
      const inner = Math.round(input.size * 0.64);
      const logo = await sharp(Buffer.from(await res.arrayBuffer()))
        .resize(inner, inner, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toBuffer();
      const png = await sharp({
        create: {
          width: input.size,
          height: input.size,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        },
      })
        .composite([{ input: logo, gravity: "centre" }])
        .png()
        .toBuffer();
      return new Response(new Uint8Array(png), { headers: PNG_HEADERS });
    } catch (cause) {
      logger.warn({ err: cause }, "Logo icon failed; using initials");
    }
  }
  const theme = brandTheme(input.color);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: theme.primary,
        color: theme.primaryForeground,
        fontSize: input.size * 0.38,
        fontWeight: 700,
        letterSpacing: "-0.02em",
      }}
    >
      {initials(input.name)}
    </div>,
    { width: input.size, height: input.size, headers: PNG_HEADERS },
  );
}
