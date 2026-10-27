"use client";

import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { routes } from "@/config/routes";
import { initials } from "@/lib/format";

export type WorkspaceOption = { slug: string; name: string; plan: string; role: string };

export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: string;
  workspaces: WorkspaceOption[];
}) {
  const { isMobile } = useSidebar();
  const active = workspaces.find((w) => w.slug === current) ?? workspaces[0];
  if (!active) return null;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
                {initials(active.name)}
              </span>
              <span className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium text-sidebar-accent-foreground">
                  {active.name}
                </span>
                <span className="truncate text-xs capitalize opacity-70">
                  {active.plan} plan · {active.role}
                </span>
              </span>
              <ChevronsUpDownIcon className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="start"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Workspaces
            </DropdownMenuLabel>
            {workspaces.map((w) => (
              <DropdownMenuItem key={w.slug} asChild>
                <Link href={routes.org(w.slug)} className="gap-2">
                  <span className="flex size-6 items-center justify-center rounded-md border text-[10px] font-semibold">
                    {initials(w.name)}
                  </span>
                  <span className="truncate">{w.name}</span>
                  {w.slug === current && <CheckIcon className="ml-auto" />}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={`${routes.onboarding}?new=1`} className="gap-2">
                <span className="flex size-6 items-center justify-center rounded-md border">
                  <PlusIcon className="size-4" />
                </span>
                <span className="font-medium text-muted-foreground">Create workspace</span>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
