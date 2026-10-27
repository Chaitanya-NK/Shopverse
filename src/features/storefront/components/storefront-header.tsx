import { SearchIcon, ShoppingBagIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { routes } from "@/config/routes";
import { initials } from "@/lib/format";

type StorefrontHeaderProps = {
  shop: { name: string; slug: string };
  cartCount: number;
  query?: string;
};

export function StorefrontHeader({ shop, cartCount, query = "" }: StorefrontHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-6">
        <Link
          href={routes.storefront(shop.slug)}
          className="flex shrink-0 items-center gap-2.5 font-semibold"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-sm text-primary-foreground">
            {initials(shop.name)}
          </span>
          <span className="hidden text-lg tracking-tight sm:inline">{shop.name}</span>
        </Link>
        <form action={routes.storefront(shop.slug)} method="get" role="search" className="flex-1">
          <InputGroup className="h-10 rounded-full bg-muted/50">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Search products"
              aria-label="Search products"
            />
          </InputGroup>
        </form>
        <Button asChild variant="ghost" className="relative shrink-0 rounded-full" size="icon">
          <Link
            href={routes.storefrontCart(shop.slug)}
            aria-label={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
          >
            <ShoppingBagIcon className="size-5" />
            {cartCount > 0 && (
              <Badge className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full px-1 tabular-nums">
                {cartCount}
              </Badge>
            )}
          </Link>
        </Button>
      </div>
    </header>
  );
}
