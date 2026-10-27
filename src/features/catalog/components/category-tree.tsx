import { PlusIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AttributeChip, CategoryActions } from "@/features/catalog/components/category-actions";
import { CategoryFormDialog } from "@/features/catalog/components/category-form-dialog";
import { TrackingBadge } from "@/features/catalog/components/tracking-badge";
import { type CategoryNode } from "@/features/catalog/tree";

type CategoryTreeProps = {
  roots: CategoryNode[];
  organizationSlug: string;
  canManage: boolean;
};

export function CategoryTree({ roots, organizationSlug, canManage }: CategoryTreeProps) {
  return (
    <div className="grid grid-cols-1 gap-6">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Badge className="bg-accent font-normal text-accent-foreground">Size</Badge>
          creates variants (one SKU per value)
        </span>
        <span className="inline-flex items-center gap-2">
          <Badge variant="secondary" className="font-normal">
            Brand
          </Badge>
          product detail
        </span>
        <span>* required</span>
      </p>
      {roots.map((root) => (
        <Card key={root.id}>
          <CardHeader>
            <CardTitle>{root.name}</CardTitle>
            <CardDescription>
              {root.children.length} {root.children.length === 1 ? "category" : "categories"}
            </CardDescription>
            {canManage && (
              <CardAction>
                <CategoryFormDialog
                  mode="create"
                  organizationSlug={organizationSlug}
                  parent={root}
                  trigger={
                    <Button variant="outline" size="sm">
                      <PlusIcon />
                      Category
                    </Button>
                  }
                />
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-lg border">
              {(root.children.length > 0 ? root.children : [root]).map((category) => (
                <li
                  key={category.id}
                  className="grid gap-3 p-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{category.name}</p>
                      {canManage && (
                        <CategoryActions organizationSlug={organizationSlug} category={category} />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <TrackingBadge tracking={category.tracking} />
                      {category.gstRate !== null && (
                        <Badge variant="secondary" className="font-normal">
                          GST {category.gstRate}%
                        </Badge>
                      )}
                      {category.productCount > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {category.productCount} product{category.productCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </div>
                  <AttributeList
                    organizationSlug={organizationSlug}
                    category={category}
                    canManage={canManage}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AttributeList({
  organizationSlug,
  category,
  canManage,
}: {
  organizationSlug: string;
  category: CategoryNode;
  canManage: boolean;
}) {
  if (category.attributes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No extra product details yet.{canManage && " Use the menu to add a field."}
      </p>
    );
  }

  return (
    <ul className="flex flex-wrap content-start gap-2" aria-label="Product details">
      {category.attributes.map((attribute) => (
        <li key={attribute.id}>
          <AttributeChip
            organizationSlug={organizationSlug}
            category={category}
            attribute={attribute}
            canManage={canManage}
          />
        </li>
      ))}
    </ul>
  );
}
