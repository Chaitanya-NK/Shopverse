import { type Enums } from "@/types/database.types";

export type CategoryAttribute = {
  id: string;
  key: string;
  label: string;
  type: Enums<"attribute_type">;
  options: string[];
  unit: string | null;
  isRequired: boolean;
  isVariantOption: boolean;
  sortOrder: number;
};

export type CategoryNode = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  industry: string | null;
  tracking: Enums<"inventory_tracking">;
  hsnCode: string | null;
  gstRate: number | null;
  sortOrder: number;
  attributes: CategoryAttribute[];
  children: CategoryNode[];
};

/**
 * Turn a flat, parent-linked list into a sorted tree. Orphans (parent not in
 * the list, e.g. hidden by RLS) are promoted to roots rather than dropped.
 */
export function buildCategoryTree(flat: Omit<CategoryNode, "children">[]): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>();
  for (const item of flat) {
    nodes.set(item.id, {
      ...item,
      attributes: [...item.attributes].sort((a, b) => a.sortOrder - b.sortOrder),
      children: [],
    });
  }

  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sort = (list: CategoryNode[]) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    for (const n of list) sort(n.children);
    return list;
  };
  return sort(roots);
}
