import {
  BadgePercentIcon,
  BarChart3Icon,
  BoxesIcon,
  CreditCardIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  MegaphoneIcon,
  PackageIcon,
  ShieldCheckIcon,
  ShoppingCartIcon,
  StoreIcon,
  TruckIcon,
  UsersIcon,
  WarehouseIcon,
} from "lucide-react";

import { routes } from "@/config/routes";

export type NavItem = {
  title: string;
  icon: LucideIcon;
  /** Omitted for modules on the roadmap that aren't built yet. */
  href?: string;
};

export type NavGroup = { label: string; items: NavItem[] };

export function getOrgNavigation(orgSlug: string): NavGroup[] {
  return [
    {
      label: "Operate",
      items: [
        { title: "Overview", icon: LayoutDashboardIcon, href: routes.org(orgSlug) },
        { title: "Shops", icon: StoreIcon, href: routes.orgShops(orgSlug) },
        { title: "Products", icon: PackageIcon },
        { title: "Inventory", icon: BoxesIcon },
        { title: "Orders", icon: ShoppingCartIcon },
        { title: "Deliveries", icon: TruckIcon },
        { title: "Warehouses", icon: WarehouseIcon },
      ],
    },
    {
      label: "Grow",
      items: [
        { title: "Customers", icon: UsersIcon },
        { title: "Marketing", icon: MegaphoneIcon },
        { title: "Discounts", icon: BadgePercentIcon },
        { title: "Analytics", icon: BarChart3Icon },
      ],
    },
    {
      label: "Organisation",
      items: [
        { title: "Team & security", icon: ShieldCheckIcon },
        { title: "Billing", icon: CreditCardIcon },
      ],
    },
  ];
}
