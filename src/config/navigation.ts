import {
  BadgePercentIcon,
  BarChart3Icon,
  BoxesIcon,
  CreditCardIcon,
  FolderTreeIcon,
  LandmarkIcon,
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
        { title: "Categories", icon: FolderTreeIcon, href: routes.orgCategories(orgSlug) },
        { title: "Products", icon: PackageIcon, href: routes.orgProducts(orgSlug) },
        { title: "Inventory", icon: BoxesIcon, href: routes.orgInventory(orgSlug) },
        { title: "Orders", icon: ShoppingCartIcon, href: routes.orgOrders(orgSlug) },
        { title: "Deliveries", icon: TruckIcon, href: routes.orgDeliveries(orgSlug) },
        { title: "Warehouses", icon: WarehouseIcon, href: routes.orgWarehouses(orgSlug) },
      ],
    },
    {
      label: "Grow",
      items: [
        { title: "Customers", icon: UsersIcon, href: routes.orgCustomers(orgSlug) },
        { title: "Marketing", icon: MegaphoneIcon },
        { title: "Discounts", icon: BadgePercentIcon },
        { title: "Analytics", icon: BarChart3Icon },
      ],
    },
    {
      label: "Organisation",
      items: [
        { title: "Team & security", icon: ShieldCheckIcon, href: routes.orgTeam(orgSlug) },
        { title: "Payments", icon: LandmarkIcon, href: routes.orgPayments(orgSlug) },
        { title: "Billing", icon: CreditCardIcon, href: routes.orgBilling(orgSlug) },
      ],
    },
  ];
}
