"use client";

import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/routes";
import { deleteCollection } from "@/features/collections/actions";

export function DeleteCollectionButton({
  organizationSlug,
  collectionId,
  title,
}: {
  organizationSlug: string;
  collectionId: string;
  title: string;
}) {
  const router = useRouter();
  return (
    <ConfirmDialog
      title={`Delete “${title}”?`}
      description="Its page stops working. The products themselves aren't touched."
      confirmLabel="Delete collection"
      trigger={
        <Button variant="outline">
          <Trash2Icon />
          Delete
        </Button>
      }
      onConfirm={async () => {
        const result = await deleteCollection({ organizationSlug, collectionId });
        if (!result.ok) {
          toast.error(result.error.message);
          return false;
        }
        toast.success("Collection deleted");
        router.push(routes.orgCollections(organizationSlug));
        return true;
      }}
    />
  );
}
