/* eslint-disable @next/next/no-img-element -- remote logo, any aspect ratio */
import { MailIcon, PhoneIcon, SearchIcon, ShoppingBagIcon } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/shared/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { routes } from "@/config/routes";
import { brandImageUrl } from "@/features/branding/schemas";
import {
  DesktopMenu,
  type MenuLink,
  MobileMenu,
  SearchButton,
} from "@/features/design/components/header-menu";
import { isExternal, shopHref } from "@/features/design/links";
import { list, str } from "@/features/design/render/frame";
import { SOCIAL_NETWORKS, type Design } from "@/features/design/schema";
import { InstallApp } from "@/features/storefront/components/install-app";
import { STOREFRONT_POLICIES } from "@/features/storefront/policies";
import { type StorefrontShop } from "@/features/storefront/schemas";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

function menuLinks(shopSlug: string, value: unknown): MenuLink[] {
  return list(value).flatMap((item) => {
    const href = shopHref(shopSlug, str(item.link));
    const label = str(item.label).trim();
    return href && label ? [{ id: str(item.id), label, href, external: isExternal(href) }] : [];
  });
}

function ShopMark({ shop, centered }: { shop: StorefrontShop; centered?: boolean }) {
  const logo = shop.branding.logo && brandImageUrl(shop.branding.logo.path, "logo", "small");
  return (
    <Link
      href={routes.storefront(shop.slug)}
      className={cn(
        "flex shrink-0 items-center gap-2.5 font-semibold",
        centered && "justify-center",
      )}
    >
      {logo ? (
        <img src={logo} alt={shop.name} className="h-9 w-auto max-w-40 object-contain" />
      ) : (
        <>
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-sm text-primary-foreground">
            {initials(shop.name)}
          </span>
          <span className="sv-heading hidden text-lg tracking-tight sm:inline">{shop.name}</span>
        </>
      )}
    </Link>
  );
}

function SearchBar({ action }: { action: string }) {
  return (
    <form action={action} method="get" role="search" className="min-w-0 flex-1">
      <InputGroup className="h-10 rounded-full bg-muted/50">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          name="q"
          type="search"
          placeholder="Search products"
          aria-label="Search products"
        />
      </InputGroup>
    </form>
  );
}

function CartButton({ shopSlug, count }: { shopSlug: string; count: number }) {
  return (
    <Button asChild variant="ghost" className="relative shrink-0 rounded-full" size="icon">
      <Link
        href={routes.storefrontCart(shopSlug)}
        aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}
      >
        <ShoppingBagIcon className="size-5" />
        {count > 0 && (
          <Badge className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full px-1 tabular-nums">
            {count}
          </Badge>
        )}
      </Link>
    </Button>
  );
}

export function StorefrontAnnouncement({ shop, design }: { shop: StorefrontShop; design: Design }) {
  if (!shop.announcement || design.header.showAnnouncement === false) return null;
  return (
    <p className="bg-primary px-4 py-2 text-center text-sm text-primary-foreground print:hidden">
      {shop.announcementLink ? (
        <Link href={shop.announcementLink} className="underline-offset-4 hover:underline">
          {shop.announcement}
        </Link>
      ) : (
        shop.announcement
      )}
    </p>
  );
}

/** The header, in the layout the shop chose. */
export function StorefrontHeader({
  shop,
  design,
  cartCount,
  account,
}: {
  shop: StorefrontShop;
  design: Design;
  cartCount: number;
  account: React.ReactNode;
}) {
  const h = design.header;
  const links = menuLinks(shop.slug, h.menu);
  const searchAction = routes.storefrontProducts(shop.slug);
  const search =
    h.search === "none" ? null : h.search === "icon" ? (
      <SearchButton action={searchAction} />
    ) : null;
  const actions = (
    <div className="flex shrink-0 items-center gap-1">
      {search}
      {account}
      <CartButton shopSlug={shop.slug} count={cartCount} />
    </div>
  );
  const container = "mx-auto w-full max-w-(--sv-width) px-4";

  return (
    <header
      className={cn(
        "z-40 border-b bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/75 print:hidden",
        h.sticky !== false && "sticky top-0",
      )}
    >
      {h.layout === "centered" ? (
        <>
          <div className={cn(container, "grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-2")}>
            <div className="flex items-center gap-1">
              <MobileMenu shopName={shop.name} links={links} />
              {h.search === "bar" && (
                <div className="hidden w-full max-w-64 md:block">
                  <SearchBar action={searchAction} />
                </div>
              )}
            </div>
            <ShopMark shop={shop} centered />
            <div className="flex justify-end">{actions}</div>
          </div>
          {links.length > 0 && (
            <DesktopMenu
              links={links}
              className={cn(container, "hidden justify-center pb-3 md:flex")}
            />
          )}
        </>
      ) : h.layout === "minimal" ? (
        <div className={cn(container, "flex h-16 items-center gap-2 sm:gap-6")}>
          <MobileMenu shopName={shop.name} links={links} />
          <ShopMark shop={shop} />
          <DesktopMenu links={links} className="hidden min-w-0 flex-1 md:block" />
          <div className="ml-auto flex items-center gap-1">
            {h.search === "bar" && <SearchButton action={searchAction} />}
            {actions}
          </div>
        </div>
      ) : (
        <>
          <div className={cn(container, "flex h-16 items-center gap-2 sm:gap-4")}>
            <MobileMenu shopName={shop.name} links={links} />
            <ShopMark shop={shop} />
            {h.search === "bar" ? <SearchBar action={searchAction} /> : <div className="flex-1" />}
            {actions}
          </div>
          {links.length > 0 && (
            <DesktopMenu links={links} className={cn(container, "hidden pb-3 md:block")} />
          )}
        </>
      )}
    </header>
  );
}

/** The footer, in the layout the shop chose. */
export function StorefrontFooter({ shop, design }: { shop: StorefrontShop; design: Design }) {
  const f = design.footer;
  const link = "text-muted-foreground hover:text-foreground hover:underline";
  const about = str(f.about) || shop.tagline;
  const menu = menuLinks(shop.slug, f.menu);
  const social = list(f.social).flatMap((s) => {
    const href = shopHref(shop.slug, str(s.link));
    const network = SOCIAL_NETWORKS.find((n) => n.value === s.network);
    return href && isExternal(href) && network
      ? [{ id: str(s.id), label: network.label, href }]
      : [];
  });
  const help = [
    { href: routes.storefrontContact(shop.slug), label: "Contact us" },
    { href: routes.storefrontAccount(shop.slug), label: "Your orders" },
    ...shop.policies
      .filter((p) => p === "shipping" || p === "returns")
      .map((p) => ({ href: routes.storefrontPolicy(shop.slug, p), label: STOREFRONT_POLICIES[p] })),
  ];
  const legal = shop.policies
    .filter((p) => p === "privacy" || p === "terms")
    .map((p) => ({ href: routes.storefrontPolicy(shop.slug, p), label: STOREFRONT_POLICIES[p] }));
  const container = "mx-auto w-full max-w-(--sv-width) px-4";

  const bottom = (
    <div className="border-t">
      <div className={cn(container, "flex flex-wrap items-center justify-between gap-3 py-4")}>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          © {shop.name} · Powered by <Logo className="text-xs" />
        </p>
        {shop.live && (
          <InstallApp
            swUrl={routes.storefrontServiceWorker(shop.slug)}
            scope={routes.storefront(shop.slug)}
          />
        )}
      </div>
    </div>
  );

  const socialList = social.length > 0 && (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {social.map((s) => (
        <li key={s.id}>
          <a href={s.href} target="_blank" rel="noopener noreferrer" className={link}>
            {s.label}
          </a>
        </li>
      ))}
    </ul>
  );

  if (f.layout === "simple") {
    const all = [
      ...menu.map((m) => ({ key: m.id, ...m })),
      ...(f.showPolicies !== false
        ? [...help, ...legal].map((h) => ({ key: h.href, ...h, external: false }))
        : []),
    ];
    return (
      <footer className="border-t bg-muted/30 print:hidden">
        <div
          className={cn(container, "flex flex-col items-center gap-5 py-10 text-center text-sm")}
        >
          <p className="sv-heading text-lg font-semibold">{shop.name}</p>
          {about && <p className="max-w-md text-muted-foreground">{about}</p>}
          {all.length > 0 && (
            <nav aria-label="Footer">
              <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2">
                {all.map((l) =>
                  l.external ? (
                    <li key={l.key}>
                      <a href={l.href} target="_blank" rel="noopener noreferrer" className={link}>
                        {l.label}
                      </a>
                    </li>
                  ) : (
                    <li key={l.key}>
                      <Link href={l.href} className={link}>
                        {l.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </nav>
          )}
          {socialList}
          {str(f.note) && <p className="text-xs text-muted-foreground">{str(f.note)}</p>}
        </div>
        {bottom}
      </footer>
    );
  }

  return (
    <footer className="border-t bg-muted/30 print:hidden">
      <div className={cn(container, "grid gap-8 py-10 text-sm sm:grid-cols-2 lg:grid-cols-4")}>
        <div className="space-y-2">
          <p className="sv-heading font-semibold">{shop.name}</p>
          {about && <p className="text-muted-foreground">{about}</p>}
          {str(f.note) && <p className="text-muted-foreground">{str(f.note)}</p>}
          {socialList && <div className="pt-2">{socialList}</div>}
        </div>
        {menu.length > 0 && (
          <nav aria-label={str(f.menuHeading) || "Shop"} className="space-y-2">
            <p className="font-medium">{str(f.menuHeading) || "Shop"}</p>
            <ul className="space-y-1.5">
              {menu.map((m) => (
                <li key={m.id}>
                  {m.external ? (
                    <a href={m.href} target="_blank" rel="noopener noreferrer" className={link}>
                      {m.label}
                    </a>
                  ) : (
                    <Link href={m.href} className={link}>
                      {m.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        )}
        {f.showPolicies !== false && (
          <nav aria-label="Help" className="space-y-2">
            <p className="font-medium">Help</p>
            <ul className="space-y-1.5">
              {[...help, ...legal].map((h) => (
                <li key={h.href}>
                  <Link href={h.href} className={link}>
                    {h.label}
                  </Link>
                </li>
              ))}
              {shop.legalName && <li className="text-muted-foreground">{shop.legalName}</li>}
              {shop.gstin && <li className="text-muted-foreground">GSTIN {shop.gstin}</li>}
            </ul>
          </nav>
        )}
        {f.showContact !== false && (shop.supportEmail || shop.supportPhone) && (
          <div className="space-y-2">
            <p className="font-medium">Get in touch</p>
            <ul className="space-y-1.5">
              {shop.supportEmail && (
                <li>
                  <a
                    href={`mailto:${shop.supportEmail}`}
                    className={cn("inline-flex items-center gap-1.5", link)}
                  >
                    <MailIcon className="size-3.5" aria-hidden />
                    {shop.supportEmail}
                  </a>
                </li>
              )}
              {shop.supportPhone && (
                <li>
                  <a
                    href={`tel:${shop.supportPhone}`}
                    className={cn("inline-flex items-center gap-1.5", link)}
                  >
                    <PhoneIcon className="size-3.5" aria-hidden />
                    {shop.supportPhone}
                  </a>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
      {bottom}
    </footer>
  );
}
