"use client";

import { MenuIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export type MenuLink = { id: string; label: string; href: string; external: boolean };

function MenuAnchor({
  link,
  className,
  onClick,
}: {
  link: MenuLink;
  className?: string;
  onClick?: () => void;
}) {
  return link.external ? (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={onClick}
    >
      {link.label}
    </a>
  ) : (
    <Link href={link.href} className={className} onClick={onClick}>
      {link.label}
    </Link>
  );
}

/** The shop's menu as a side sheet, on small screens. */
export function MobileMenu({ shopName, links }: { shopName: string; links: MenuLink[] }) {
  const [open, setOpen] = useState(false);
  if (links.length === 0) return null;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 rounded-full md:hidden"
          aria-label="Menu"
        >
          <MenuIcon className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <SheetHeader>
          <SheetTitle>{shopName}</SheetTitle>
          <SheetDescription className="sr-only">Shop menu</SheetDescription>
        </SheetHeader>
        <nav aria-label="Shop menu" className="flex flex-col px-2">
          {links.map((link) => (
            <MenuAnchor
              key={link.id}
              link={link}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2.5 text-base hover:bg-muted"
            />
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export function DesktopMenu({ links, className }: { links: MenuLink[]; className?: string }) {
  if (links.length === 0) return null;
  return (
    <nav aria-label="Shop menu" className={className}>
      <ul className="flex flex-wrap items-center gap-x-6 gap-y-1">
        {links.map((link) => (
          <li key={link.id}>
            <MenuAnchor
              link={link}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** A search button that opens a small search box. */
export function SearchButton({ action }: { action: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="shrink-0 rounded-full" aria-label="Search">
          <SearchIcon className="size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <form action={action} method="get" role="search">
          <InputGroup className="h-10 rounded-full">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              name="q"
              type="search"
              autoFocus
              placeholder="Search products"
              aria-label="Search products"
            />
          </InputGroup>
        </form>
      </PopoverContent>
    </Popover>
  );
}
