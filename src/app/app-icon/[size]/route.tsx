import { appIcon, ICON_SIZES, type IconSize } from "@/features/branding/icons";

/** Shopverse's own app icon (the staff app). */
export async function GET(_request: Request, ctx: RouteContext<"/app-icon/[size]">) {
  const px = Number((await ctx.params).size);
  if (!(ICON_SIZES as readonly number[]).includes(px))
    return new Response("Not found", { status: 404 });
  return appIcon({ name: "Shopverse", color: "#1d6b5c", logoUrl: null, size: px as IconSize });
}
