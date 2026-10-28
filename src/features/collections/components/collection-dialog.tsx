"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { type z } from "zod";

import { FormRootError } from "@/components/shared/form-root-error";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { routes } from "@/config/routes";
import { saveCollection } from "@/features/collections/actions";
import { type CollectionFormInput, collectionFormSchema } from "@/features/collections/schemas";
import { applyActionError } from "@/lib/forms/apply-action-error";
import { slugify } from "@/lib/slug";

type Existing = {
  id: string;
  shopId: string;
  title: string;
  slug: string;
  description: string | null;
  featured: boolean;
  isActive: boolean;
};

export function CollectionDialog({
  organizationSlug,
  shops,
  collection,
  trigger,
}: {
  organizationSlug: string;
  shops: { id: string; name: string; slug: string }[];
  collection?: Existing;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{collection ? "Edit collection" : "New collection"}</DialogTitle>
          <DialogDescription>
            A hand-picked group of products with its own page, like “Diwali gifts” or “New in”.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <CollectionForm
            organizationSlug={organizationSlug}
            shops={shops}
            collection={collection}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CollectionForm({
  organizationSlug,
  shops,
  collection,
  onDone,
}: {
  organizationSlug: string;
  shops: { id: string; name: string; slug: string }[];
  collection?: Existing;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [slugTouched, setSlugTouched] = useState(Boolean(collection));
  const form = useForm<CollectionFormInput, unknown, z.output<typeof collectionFormSchema>>({
    resolver: zodResolver(collectionFormSchema),
    defaultValues: {
      organizationSlug,
      collectionId: collection?.id,
      shopId: collection?.shopId ?? (shops.length === 1 ? shops[0]!.id : ""),
      title: collection?.title ?? "",
      slug: collection?.slug ?? "",
      description: collection?.description ?? "",
      featured: collection?.featured ?? false,
      isActive: collection?.isActive ?? true,
    },
  });
  const [shopId, slug] = useWatch({ control: form.control, name: ["shopId", "slug"] });
  const shopSlug = shops.find((s) => s.id === shopId)?.slug;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await saveCollection(values);
      if (!result.ok) {
        applyActionError(form, result.error);
        return;
      }
      toast.success(collection ? "Collection saved" : "Collection created");
      onDone();
      if (!collection)
        router.push(routes.orgCollection(organizationSlug, result.data.collectionId));
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FieldGroup className="gap-4">
        <Controller
          control={form.control}
          name="title"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="collection-title">Name</FieldLabel>
              <Input
                id="collection-title"
                {...field}
                onChange={(e) => {
                  field.onChange(e);
                  if (!slugTouched) form.setValue("slug", slugify(e.target.value, 60));
                }}
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={form.control}
            name="shopId"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="collection-shop">Shop</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="collection-shop"
                    className="w-full"
                    aria-invalid={fieldState.invalid}
                  >
                    <SelectValue placeholder="Choose a shop" />
                  </SelectTrigger>
                  <SelectContent>
                    {shops.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="slug"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="collection-slug">Link</FieldLabel>
                <Input
                  id="collection-slug"
                  {...field}
                  onChange={(e) => {
                    setSlugTouched(true);
                    field.onChange(e);
                  }}
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription className="truncate font-mono text-xs">
                  {shopSlug && slug ? routes.storefrontCollection(shopSlug, slug) : " "}
                </FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </div>
        <Controller
          control={form.control}
          name="description"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="collection-description">Description (optional)</FieldLabel>
              <Textarea
                id="collection-description"
                rows={3}
                maxLength={1000}
                {...field}
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="featured"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Switch
                id="collection-featured"
                checked={field.value ?? false}
                onCheckedChange={field.onChange}
              />
              <span>
                <FieldLabel htmlFor="collection-featured">Show on the homepage</FieldLabel>
                <FieldDescription>As a row of its first products.</FieldDescription>
              </span>
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Switch
                id="collection-active"
                checked={field.value ?? true}
                onCheckedChange={field.onChange}
              />
              <span>
                <FieldLabel htmlFor="collection-active">Visible in the shop</FieldLabel>
              </span>
            </Field>
          )}
        />
      </FieldGroup>
      <FormRootError form={form} />
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isPending}>
          {isPending && <Spinner />}
          {collection ? "Save" : "Create collection"}
        </Button>
      </DialogFooter>
    </form>
  );
}
