"use client";

import { HeartIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { routes } from "@/config/routes";
import { setWishlist } from "@/features/shopper/actions";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

/**
 * Save / unsave a product. Signed-out shoppers are sent to sign in and brought
 * back. `variant="overlay"` sits on a product card's image.
 */
export function WishlistButton({
  shopSlug,
  productId,
  productTitle,
  saved: initiallySaved,
  signedIn,
  variant = "button",
}: {
  shopSlug: string;
  productId: string;
  productTitle: string;
  saved: boolean;
  signedIn: boolean;
  variant?: "button" | "overlay";
}) {
  const t = useT();
  const pathname = usePathname();
  const [saved, setSaved] = useState(initiallySaved);
  const [isPending, startTransition] = useTransition();
  const label = saved
    ? t("Remove {product} from wishlist", { product: productTitle })
    : t("Save {product} to wishlist", { product: productTitle });
  const icon = (
    <HeartIcon className={cn("size-5", saved && "fill-rose-500 text-rose-500")} aria-hidden />
  );

  const overlayClass =
    "absolute top-2 right-2 z-10 size-9 rounded-full bg-background/90 shadow-sm backdrop-blur hover:bg-background";

  if (!signedIn) {
    return (
      <Button
        asChild
        variant={variant === "overlay" ? "ghost" : "outline"}
        size={variant === "overlay" ? "icon" : "lg"}
        className={variant === "overlay" ? overlayClass : undefined}
      >
        <Link href={routes.storefrontSignIn(shopSlug, pathname)} aria-label={label}>
          {icon}
          {variant === "button" && t("Save")}
        </Link>
      </Button>
    );
  }

  const toggle = () => {
    const next = !saved;
    setSaved(next);
    startTransition(async () => {
      const result = await setWishlist({ shopSlug, productId, saved: next });
      if (!result.ok) {
        setSaved(!next);
        toast.error(t(result.error.message));
        return;
      }
      toast.success(next ? t("Saved to your wishlist") : t("Removed from your wishlist"));
    });
  };

  return (
    <Button
      type="button"
      variant={variant === "overlay" ? "ghost" : "outline"}
      size={variant === "overlay" ? "icon" : "lg"}
      className={variant === "overlay" ? overlayClass : undefined}
      aria-label={label}
      aria-pressed={saved}
      disabled={isPending}
      onClick={toggle}
    >
      {icon}
      {variant === "button" && (saved ? t("Saved") : t("Save"))}
    </Button>
  );
}
