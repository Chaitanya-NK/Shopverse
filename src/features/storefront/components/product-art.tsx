import {
  BookOpenIcon,
  CookingPotIcon,
  DumbbellIcon,
  GemIcon,
  type LucideIcon,
  PackageIcon,
  PenToolIcon,
  ShirtIcon,
  ShoppingBasketIcon,
  SmartphoneIcon,
  SofaIcon,
  SparklesIcon,
  ToyBrickIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  fashion: ShirtIcon,
  electronics: SmartphoneIcon,
  home_kitchen: CookingPotIcon,
  grocery: ShoppingBasketIcon,
  beauty: SparklesIcon,
  books: BookOpenIcon,
  toys: ToyBrickIcon,
  sports: DumbbellIcon,
  furniture: SofaIcon,
  jewellery: GemIcon,
  stationery: PenToolIcon,
};

/** Stable small hash so a product always gets the same colours. */
function hue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

/**
 * Artwork shown until product photos are uploaded: a soft two-tone gradient
 * keyed to the product, with its industry's icon.
 */
export function ProductArt({
  seed,
  industry,
  className,
  size = "md",
}: {
  seed: string;
  industry: string | null;
  className?: string;
  size?: "md" | "lg";
}) {
  const Icon = (industry && ICONS[industry]) || PackageIcon;
  const h = hue(seed);
  return (
    <div
      aria-hidden
      className={cn(
        "relative flex aspect-square items-center justify-center overflow-hidden rounded-xl",
        className,
      )}
      style={{
        backgroundImage: `radial-gradient(circle at 30% 20%, oklch(0.97 0.03 ${h}), transparent 60%), linear-gradient(135deg, oklch(0.93 0.05 ${h}), oklch(0.86 0.07 ${(h + 40) % 360}))`,
      }}
    >
      <Icon
        className={size === "lg" ? "size-24" : "size-12"}
        strokeWidth={1.25}
        style={{ color: `oklch(0.42 0.08 ${h})` }}
      />
    </div>
  );
}
