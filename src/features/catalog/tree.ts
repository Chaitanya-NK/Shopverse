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
  returnable: boolean;
  sortOrder: number;
  /** Products directly in this category. */
  productCount: number;
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

/** A category products can be filed under, with the industry it belongs to. */
export type CategoryOption = Pick<
  CategoryNode,
  "id" | "name" | "tracking" | "hsnCode" | "gstRate" | "attributes"
> & { group: string };

/** Leaf-level categories grouped by their top-level (industry) category. */
export function toCategoryOptions(roots: readonly CategoryNode[]): CategoryOption[] {
  const options: CategoryOption[] = [];
  const visit = (node: CategoryNode, group: string) => {
    if (node.children.length === 0) {
      options.push({
        id: node.id,
        name: node.name,
        group,
        tracking: node.tracking,
        hsnCode: node.hsnCode,
        gstRate: node.gstRate,
        attributes: node.attributes,
      });
    }
    for (const child of node.children) visit(child, group);
  };
  for (const root of roots) visit(root, root.name);
  return options;
}
