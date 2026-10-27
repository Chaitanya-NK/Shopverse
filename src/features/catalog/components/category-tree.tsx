import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrackingBadge } from "@/features/catalog/components/tracking-badge";
import { type CategoryAttribute, type CategoryNode } from "@/features/catalog/tree";
import { cn } from "@/lib/utils";

export function CategoryTree({ roots }: { roots: CategoryNode[] }) {
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
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-lg border">
              {(root.children.length > 0 ? root.children : [root]).map((category) => (
                <li
                  key={category.id}
                  className="grid gap-3 p-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]"
                >
                  <div className="space-y-2">
                    <p className="font-medium">{category.name}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <TrackingBadge tracking={category.tracking} />
                      {category.gstRate !== null && (
                        <Badge variant="secondary" className="font-normal">
                          GST {category.gstRate}%
                        </Badge>
                      )}
                    </div>
                  </div>
                  <AttributeList attributes={category.attributes} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AttributeList({ attributes }: { attributes: CategoryAttribute[] }) {
  if (attributes.length === 0) {
    return <p className="text-sm text-muted-foreground">No extra product details yet.</p>;
  }

  return (
    <ul className="flex flex-wrap content-start gap-2" aria-label="Product details">
      {attributes.map((attribute) => (
        <li key={attribute.id}>
          <Badge
            variant={attribute.isVariantOption ? "default" : "secondary"}
            className={cn(
              "font-normal",
              attribute.isVariantOption && "bg-accent text-accent-foreground",
            )}
            title={describe(attribute)}
          >
            {attribute.label}
            {attribute.unit && <span className="opacity-70">({attribute.unit})</span>}
            {attribute.isRequired && <span aria-label="required">*</span>}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function describe(attribute: CategoryAttribute): string {
  const parts = [attribute.isVariantOption ? "Creates variants" : "Product detail", attribute.type];
  if (attribute.options.length > 0) parts.push(attribute.options.join(", "));
  return parts.join(" · ");
}
