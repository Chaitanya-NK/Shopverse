"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NavUser } from "@/components/app-shell/nav-user";
import { WorkspaceSwitcher, type WorkspaceOption } from "@/components/app-shell/workspace-switcher";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { getOrgNavigation } from "@/config/navigation";
import { routes } from "@/config/routes";

type AppSidebarProps = {
  orgSlug: string;
  workspaces: WorkspaceOption[];
  user: { name: string; email: string };
};

export function AppSidebar({ orgSlug, workspaces, user }: AppSidebarProps) {
  const pathname = usePathname();
  const navigation = getOrgNavigation(orgSlug);

  const isActive = (href: string) =>
    href === routes.org(orgSlug)
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <WorkspaceSwitcher current={orgSlug} workspaces={workspaces} />
      </SidebarHeader>

      <SidebarContent>
        {navigation.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  {item.href ? (
                    <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.title}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton
                      disabled
                      tooltip={`${item.title} (coming soon)`}
                      aria-disabled="true"
                    >
                      <item.icon />
                      <span>{item.title}</span>
                      <Badge
                        variant="outline"
                        className="ml-auto border-sidebar-border text-[10px] text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden"
                      >
                        Soon
                      </Badge>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
