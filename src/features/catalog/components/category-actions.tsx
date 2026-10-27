"use client";

import { MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteAttribute, deleteCategory } from "@/features/catalog/actions";
import { AttributeFormDialog } from "@/features/catalog/components/attribute-form-dialog";
import { CategoryFormDialog } from "@/features/catalog/components/category-form-dialog";
import { type CategoryAttribute, type CategoryNode } from "@/features/catalog/tree";
import { cn } from "@/lib/utils";

type Dialog = "edit" | "field" | "delete" | null;

/** Row menu for a category: edit, add a field, delete. */
export function CategoryActions({
  organizationSlug,
  category,
}: {
  organizationSlug: string;
  category: CategoryNode;
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const toggle = (name: Exclude<Dialog, null>) => (open: boolean) => setDialog(open ? name : null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`${category.name} actions`}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("field")}>
            <PlusIcon />
            Add field
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <PencilIcon />
            Edit category
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
            <Trash2Icon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CategoryFormDialog
        mode="edit"
        organizationSlug={organizationSlug}
        category={category}
        open={dialog === "edit"}
        onOpenChange={toggle("edit")}
      />
      <AttributeFormDialog
        organizationSlug={organizationSlug}
        categoryId={category.id}
        categoryName={category.name}
        open={dialog === "field"}
        onOpenChange={toggle("field")}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={toggle("delete")}
        title={`Delete ${category.name}?`}
        description={
          category.productCount > 0
            ? `It still has ${category.productCount} product${category.productCount === 1 ? "" : "s"}. Move or delete them first.`
            : "Its fields and any sub-categories are removed too. This can’t be undone."
        }
        confirmLabel="Delete category"
        onConfirm={async () => {
          const result = await deleteCategory({ organizationSlug, categoryId: category.id });
          if (!result.ok) {
            toast.error(result.error.message);
            return false;
          }
          toast.success(`${category.name} deleted`);
          return true;
        }}
      />
    </>
  );
}

/** A field chip. Managers can click it to edit or remove the field. */
export function AttributeChip({
  organizationSlug,
  category,
  attribute,
  canManage,
}: {
  organizationSlug: string;
  category: Pick<CategoryNode, "id" | "name">;
  attribute: CategoryAttribute;
  canManage: boolean;
}) {
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);

  const chip = (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-md border border-transparent px-2 text-xs whitespace-nowrap",
        attribute.isVariantOption
          ? "bg-accent text-accent-foreground"
          : "bg-secondary text-secondary-foreground",
      )}
    >
      {attribute.label}
      {attribute.unit && <span className="opacity-70">({attribute.unit})</span>}
      {attribute.isRequired && <span aria-label="required">*</span>}
    </span>
  );

  if (!canManage) return <span title={describe(attribute)}>{chip}</span>;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={describe(attribute)}
          aria-label={`${attribute.label} field options`}
        >
          {chip}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <PencilIcon />
            Edit field
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
            <Trash2Icon />
            Remove field
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AttributeFormDialog
        organizationSlug={organizationSlug}
        categoryId={category.id}
        categoryName={category.name}
        attribute={attribute}
        open={dialog === "edit"}
        onOpenChange={(open) => setDialog(open ? "edit" : null)}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
        title={`Remove ${attribute.label}?`}
        description={
          attribute.isVariantOption
            ? "Variant options can only be removed when no variants use them."
            : `Values already entered for ${attribute.label} are removed from every product in ${category.name}.`
        }
        confirmLabel="Remove field"
        onConfirm={async () => {
          const result = await deleteAttribute({ organizationSlug, attributeId: attribute.id });
          if (!result.ok) {
            toast.error(result.error.message);
            return false;
          }
          toast.success(`${attribute.label} removed`);
          return true;
        }}
      />
    </>
  );
}

function describe(attribute: CategoryAttribute): string {
  const parts = [attribute.isVariantOption ? "Creates variants" : "Product detail", attribute.type];
  if (attribute.options.length > 0) parts.push(attribute.options.join(", "));
  return parts.join(" · ");
}
