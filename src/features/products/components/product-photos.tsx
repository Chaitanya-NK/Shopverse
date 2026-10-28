"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ImageIcon,
  ImagePlusIcon,
  MoreVerticalIcon,
  PaletteIcon,
  StarIcon,
  TextIcon,
  Trash2Icon,
} from "lucide-react";
import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  deleteProductImage,
  reorderProductImages,
  setProductImageVariant,
  updateProductImageAlt,
  uploadProductImage,
} from "@/features/products/image-actions";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_PRODUCT_IMAGES,
  productImageUrl,
} from "@/features/products/images";
import { type ProductPhoto } from "@/features/products/queries";
import { shrinkImage } from "@/lib/images/shrink";
import { cn } from "@/lib/utils";

type Pending = { key: string; name: string; preview: string };

export function ProductPhotos({
  organizationSlug,
  productId,
  productTitle,
  photos,
  variants = [],
}: {
  organizationSlug: string;
  productId: string;
  productTitle: string;
  photos: ProductPhoto[];
  /** The product's options, to say which one a photo shows. */
  variants?: { id: string; title: string }[];
}) {
  const variantTitles = new Map(variants.map((v) => [v.id, v.title]));
  const assignVariant = async (photo: ProductPhoto, variantId: string | null) => {
    const result = await setProductImageVariant({
      organizationSlug,
      productId,
      imageId: photo.id,
      variantId,
    });
    if (!result.ok) toast.error(result.error.message);
    else
      toast.success(
        variantId ? `Shown first for ${variantTitles.get(variantId)}` : "Shown for all options",
      );
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const [isReordering, startReorder] = useTransition();
  const [editing, setEditing] = useState<ProductPhoto | null>(null);
  const [deleting, setDeleting] = useState<ProductPhoto | null>(null);
  const room = MAX_PRODUCT_IMAGES - photos.length - pending.length;

  const upload = async (files: File[]) => {
    const accepted = files.filter((f) =>
      (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(f.type),
    );
    if (accepted.length < files.length)
      toast.error("Some files were skipped: use JPG, PNG or WebP.");
    const batch = accepted.slice(0, Math.max(room, 0));
    if (accepted.length > batch.length)
      toast.error(`A product can have up to ${MAX_PRODUCT_IMAGES} photos.`);

    const queued = batch.map((file) => ({
      file,
      item: { key: crypto.randomUUID(), name: file.name, preview: URL.createObjectURL(file) },
    }));
    setPending((p) => [...p, ...queued.map((q) => q.item)]);

    let done = 0;
    // One at a time keeps the order the person chose and the server load low.
    for (const { file, item } of queued) {
      const result = await uploadProductImage({
        organizationSlug,
        productId,
        alt: "",
        file: await shrinkImage(file),
      });
      setPending((p) => p.filter((x) => x.key !== item.key));
      URL.revokeObjectURL(item.preview);
      if (result.ok) done += 1;
      else
        toast.error(`${file.name}: ${result.error.fieldErrors?.file?.[0] ?? result.error.message}`);
    }
    if (done > 0) toast.success(done === 1 ? "Photo added" : `${done} photos added`);
  };

  const move = (index: number, to: number) =>
    startReorder(async () => {
      const ids = photos.map((p) => p.id);
      const [moved] = ids.splice(index, 1);
      ids.splice(to, 0, moved!);
      const result = await reorderProductImages({ organizationSlug, productId, imageIds: ids });
      if (!result.ok) toast.error(result.error.message);
    });

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (room > 0) void upload([...e.dataTransfer.files]);
        }}
        className={cn(
          "grid grid-cols-2 gap-3 rounded-xl sm:grid-cols-3 lg:grid-cols-4",
          dragging && "ring-2 ring-primary ring-offset-4",
        )}
        aria-busy={isReordering || pending.length > 0}
      >
        {photos.map((photo, index) => (
          <figure
            key={photo.id}
            className="group relative aspect-square overflow-hidden rounded-xl border bg-muted"
          >
            <Image
              src={productImageUrl(photo.path, "thumb")}
              alt={photo.alt ?? `${productTitle} photo ${index + 1}`}
              fill
              unoptimized
              sizes="(min-width: 1024px) 25vw, 50vw"
              className="object-cover"
            />
            {index === 0 && <Badge className="absolute top-2 left-2">Cover</Badge>}
            {photo.variantId && variantTitles.get(photo.variantId) && (
              <Badge variant="secondary" className="absolute bottom-2 left-2 max-w-[80%] truncate">
                {variantTitles.get(photo.variantId)}
              </Badge>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute top-2 right-2 size-8 rounded-full shadow"
                  aria-label={`Photo ${index + 1} options`}
                  disabled={isReordering}
                >
                  <MoreVerticalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {index > 0 && (
                  <DropdownMenuItem onSelect={() => move(index, 0)}>
                    <StarIcon /> Make cover
                  </DropdownMenuItem>
                )}
                {index > 0 && (
                  <DropdownMenuItem onSelect={() => move(index, index - 1)}>
                    <ArrowLeftIcon /> Move earlier
                  </DropdownMenuItem>
                )}
                {index < photos.length - 1 && (
                  <DropdownMenuItem onSelect={() => move(index, index + 1)}>
                    <ArrowRightIcon /> Move later
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => setEditing(photo)}>
                  <TextIcon /> Describe photo
                </DropdownMenuItem>
                {variants.length > 1 && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <PaletteIcon /> Shows option
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuLabel>Shown first when chosen</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={photo.variantId ?? "all"}
                        onValueChange={(v) => assignVariant(photo, v === "all" ? null : v)}
                      >
                        <DropdownMenuRadioItem value="all">All options</DropdownMenuRadioItem>
                        {variants.map((v) => (
                          <DropdownMenuRadioItem key={v.id} value={v.id}>
                            {v.title}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(photo)}>
                  <Trash2Icon /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {!photo.alt && (
              <figcaption className="absolute inset-x-2 bottom-2 rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                No description yet
              </figcaption>
            )}
          </figure>
        ))}

        {pending.map((item) => (
          <div
            key={item.key}
            className="relative aspect-square overflow-hidden rounded-xl border bg-muted"
          >
            {/* Local preview while it uploads (an object URL, so no optimisation). */}
            <Image src={item.preview} alt="" fill unoptimized className="object-cover opacity-50" />
            <span className="absolute inset-0 flex items-center justify-center">
              <Spinner className="size-6" />
              <span className="sr-only">Uploading {item.name}</span>
            </span>
          </div>
        ))}

        {room > 0 && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {photos.length === 0 ? (
              <ImageIcon className="size-6" />
            ) : (
              <ImagePlusIcon className="size-6" />
            )}
            <span className="font-medium">Add photos</span>
            <span className="px-4 text-center text-xs">or drop them here</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) void upload(files);
        }}
      />
      <p className="text-sm text-muted-foreground">
        {photos.length} of {MAX_PRODUCT_IMAGES}. The first photo is the cover in your shop. Square
        photos on a plain background look best; large photos are resized automatically.
      </p>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Describe this photo</DialogTitle>
            <DialogDescription>
              Read aloud by screen readers and used by search engines.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <AltForm
              key={editing.id}
              photo={editing}
              onSave={async (alt) => {
                const result = await updateProductImageAlt({
                  organizationSlug,
                  productId,
                  imageId: editing.id,
                  alt,
                });
                if (!result.ok) {
                  toast.error(result.error.message);
                  return;
                }
                toast.success("Description saved");
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this photo?"
        description="It disappears from your shop straight away."
        confirmLabel="Delete photo"
        onConfirm={async () => {
          if (!deleting) return true;
          const result = await deleteProductImage({
            organizationSlug,
            productId,
            imageId: deleting.id,
          });
          if (!result.ok) {
            toast.error(result.error.message);
            return false;
          }
          toast.success("Photo deleted");
          return true;
        }}
      />
    </div>
  );
}

function AltForm({
  photo,
  onSave,
}: {
  photo: ProductPhoto;
  onSave: (alt: string) => Promise<void>;
}) {
  const [alt, setAlt] = useState(photo.alt ?? "");
  const [isPending, startTransition] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(() => onSave(alt));
      }}
    >
      <div className="relative mx-auto aspect-square w-40 overflow-hidden rounded-lg border">
        <Image
          src={productImageUrl(photo.path, "thumb")}
          alt=""
          fill
          unoptimized
          className="object-cover"
        />
      </div>
      <Field>
        <FieldLabel htmlFor="photo-alt">Description</FieldLabel>
        <Input
          id="photo-alt"
          value={alt}
          maxLength={200}
          onChange={(e) => setAlt(e.target.value)}
          placeholder="Navy cotton tee, front view"
          autoFocus
        />
        <FieldDescription>Say what&apos;s in the photo, in a few words.</FieldDescription>
      </Field>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isPending}>
          {isPending && <Spinner />}
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
