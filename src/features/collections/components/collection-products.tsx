"use client";

import { ArrowDownIcon, ArrowUpIcon, ImageIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { routes } from "@/config/routes";
import {
  addCollectionProducts,
  findProductsForCollection,
  removeCollectionProducts,
  reorderCollection,
} from "@/features/collections/actions";
import { type CollectionProduct } from "@/features/collections/queries";
import { productImageUrl } from "@/features/products/images";

function Thumb({ path, title }: { path: string | null; title: string }) {
  return (
    <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
      {path ? (
        <Image
          src={productImageUrl(path, "thumb")}
          alt={title}
          fill
          unoptimized
          sizes="40px"
          className="object-cover"
        />
      ) : (
        <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
      )}
    </span>
  );
}

/** The products in a collection, in the order shoppers see them. */
export function CollectionProducts({
  organizationSlug,
  collectionId,
  products,
}: {
  organizationSlug: string;
  collectionId: string;
  products: CollectionProduct[];
}) {
  const [isPending, startTransition] = useTransition();
  const ref = { organizationSlug, collectionId };

  const move = (from: number, to: number) =>
    startTransition(async () => {
      const ids = products.map((p) => p.id);
      const [moved] = ids.splice(from, 1);
      ids.splice(to, 0, moved!);
      const result = await reorderCollection({ ...ref, productIds: ids });
      if (!result.ok) toast.error(result.error.message);
    });
  const remove = (id: string) =>
    startTransition(async () => {
      const result = await removeCollectionProducts({ ...ref, productIds: [id] });
      if (!result.ok) toast.error(result.error.message);
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {products.length} product{products.length === 1 ? "" : "s"}, shown in this order.
        </p>
        <AddProductsDialog
          organizationSlug={organizationSlug}
          collectionId={collectionId}
          existing={products.map((p) => p.id)}
        />
      </div>
      {products.length > 0 && (
        <ol className="divide-y rounded-xl border" aria-busy={isPending}>
          {products.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 p-3">
              <span className="w-6 text-right text-sm text-muted-foreground tabular-nums">
                {i + 1}
              </span>
              <Thumb path={p.coverPath} title={p.title} />
              <span className="min-w-0 flex-1">
                <Link
                  href={routes.orgProduct(organizationSlug, p.id)}
                  className="block truncate font-medium hover:underline"
                >
                  {p.title}
                </Link>
                {!p.visible && (
                  <Badge variant="outline" className="mt-0.5">
                    {p.status !== "active"
                      ? `${p.status[0]!.toUpperCase()}${p.status.slice(1)}`
                      : "Not in this shop"}
                    : hidden
                  </Badge>
                )}
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Move ${p.title} up`}
                disabled={i === 0 || isPending}
                onClick={() => move(i, i - 1)}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Move ${p.title} down`}
                disabled={i === products.length - 1 || isPending}
                onClick={() => move(i, i + 1)}
              >
                <ArrowDownIcon />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Remove ${p.title}`}
                disabled={isPending}
                onClick={() => remove(p.id)}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function AddProductsDialog({
  organizationSlug,
  collectionId,
  existing,
}: {
  organizationSlug: string;
  collectionId: string;
  existing: string[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<
    { id: string; title: string; status: string; coverPath: string | null }[]
  >([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(
      () =>
        startLoading(async () => {
          const result = await findProductsForCollection({
            organizationSlug,
            exclude: existing,
            search,
          });
          if (result.ok) setResults(result.data);
        }),
      200,
    );
    return () => clearTimeout(t);
  }, [open, search, organizationSlug, existing]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setChosen(new Set());
          setSearch("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <PlusIcon />
          Add products
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add products</DialogTitle>
          <DialogDescription>
            They&apos;re added at the end. Only products listed in this shop are shown to shoppers.
          </DialogDescription>
        </DialogHeader>
        <InputGroup>
          <InputGroupAddon>{loading ? <Spinner /> : <SearchIcon />}</InputGroupAddon>
          <InputGroupInput
            aria-label="Search products"
            placeholder="Search products"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
        <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
          {results.length === 0 && !loading && (
            <li className="p-4 text-center text-sm text-muted-foreground">
              No more products to add.
            </li>
          )}
          {results.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-3 p-2.5 hover:bg-muted/50">
                <Checkbox
                  checked={chosen.has(p.id)}
                  onCheckedChange={(on) =>
                    setChosen((c) => {
                      const next = new Set(c);
                      if (on) next.add(p.id);
                      else next.delete(p.id);
                      return next;
                    })
                  }
                  aria-label={`Add ${p.title}`}
                />
                <Thumb path={p.coverPath} title={p.title} />
                <span className="min-w-0 flex-1 truncate text-sm">{p.title}</span>
                {p.status !== "active" && <Badge variant="outline">{p.status}</Badge>}
              </label>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={chosen.size === 0 || saving}
            onClick={() =>
              startSaving(async () => {
                const result = await addCollectionProducts({
                  organizationSlug,
                  collectionId,
                  productIds: [...chosen],
                });
                if (!result.ok) {
                  toast.error(result.error.message);
                  return;
                }
                toast.success(`Added ${chosen.size} product${chosen.size === 1 ? "" : "s"}`);
                setOpen(false);
                setChosen(new Set());
              })
            }
          >
            {saving && <Spinner />}
            Add {chosen.size || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
