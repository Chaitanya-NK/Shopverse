"use client";

import {
  HeartIcon,
  LogOutIcon,
  MapPinIcon,
  PackageIcon,
  UserIcon,
  UserRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { routes } from "@/config/routes";
import { signOutShopper } from "@/features/shopper/actions";
import { initials } from "@/lib/format";
import { useT } from "@/i18n/client";

export function AccountMenu({
  shopSlug,
  shopper,
}: {
  shopSlug: string;
  shopper: { name: string | null; email: string } | null;
}) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (!shopper) {
    const onAccountPage = pathname.startsWith(routes.storefrontAccount(shopSlug));
    return (
      <Button asChild variant="ghost" className="shrink-0 rounded-full max-sm:size-9 max-sm:p-0">
        <Link href={routes.storefrontSignIn(shopSlug, onAccountPage ? undefined : pathname)}>
          <UserIcon className="size-5" />
          <span className="max-sm:sr-only">{t("Sign in")}</span>
        </Link>
      </Button>
    );
  }

  const signOut = () =>
    startTransition(async () => {
      const result = await signOutShopper({ shopSlug });
      if (!result.ok) {
        toast.error(t(result.error.message));
        return;
      }
      toast.success(t("Signed out"));
      router.replace(routes.storefront(shopSlug));
      router.refresh();
    });

  const label = shopper.name ?? shopper.email;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 rounded-full"
          aria-label={t("Your account ({name})", { name: label })}
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {initials(label)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate font-medium">{shopper.name ?? t("Your account")}</span>
          <span className="block truncate text-xs text-muted-foreground">{shopper.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={routes.storefrontAccount(shopSlug)}>
            <PackageIcon /> {t("Orders")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={routes.storefrontWishlist(shopSlug)}>
            <HeartIcon /> {t("Wishlist")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={routes.storefrontAddresses(shopSlug)}>
            <MapPinIcon /> {t("Addresses")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={routes.storefrontProfile(shopSlug)}>
            <UserRoundIcon /> {t("Profile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={isPending}
          onSelect={(e) => {
            e.preventDefault();
            signOut();
          }}
        >
          <LogOutIcon /> {t("Sign out")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
