"use client";

import { FileTextIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useId, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { newId } from "@/features/design/fields";
import {
  type CustomPage,
  MAX_PAGES,
  newSection,
  PAGE_HANDLE_PATTERN,
  RESERVED_PAGE_HANDLES,
} from "@/features/design/schema";

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}

export function handleProblem(handle: string, pages: CustomPage[], self?: string): string | null {
  if (!PAGE_HANDLE_PATTERN.test(handle)) return "Use lowercase letters, numbers and dashes.";
  if ((RESERVED_PAGE_HANDLES as readonly string[]).includes(handle))
    return `“${handle}” is used by the shop's ${handle} policy page.`;
  if (pages.some((p) => p.handle === handle && p.id !== self))
    return "Another page already uses this address.";
  return null;
}

/** The shop's own pages: About us, Size guide, Wholesale… */
export function PagesPanel({
  pages,
  onChange,
  onOpen,
}: {
  pages: CustomPage[];
  onChange: (pages: CustomPage[]) => void;
  onOpen: (id: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Pages you build from sections, at <code className="text-xs">/pages/…</code>. Link to them
        from the header or footer menu.
      </p>
      {pages.length > 0 ? (
        <ul className="space-y-1.5">
          {pages.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onOpen(p.id)}
                className="flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <FileTextIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{p.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    /pages/{p.handle} · {p.sections.length} section
                    {p.sections.length === 1 ? "" : "s"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          No pages yet.
        </p>
      )}
      <Button
        variant="outline"
        className="w-full"
        disabled={pages.length >= MAX_PAGES}
        onClick={() => setCreating(true)}
      >
        <PlusIcon />
        New page
      </Button>
      <NewPageDialog
        open={creating}
        onOpenChange={setCreating}
        pages={pages}
        onCreate={(page) => {
          onChange([...pages, page]);
          setCreating(false);
          onOpen(page.id);
        }}
      />
    </div>
  );
}

function NewPageDialog({
  open,
  onOpenChange,
  pages,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: CustomPage[];
  onCreate: (page: CustomPage) => void;
}) {
  const id = useId();
  const [title, setTitle] = useState("");
  const [handle, setHandle] = useState("");
  const [touched, setTouched] = useState(false);
  const effective = touched ? handle : slugify(title);
  const problem = effective ? handleProblem(effective, pages) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setTitle("");
          setHandle("");
          setTouched(false);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New page</DialogTitle>
          <DialogDescription>
            It starts with a heading and some text; add any sections you like.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim() || !effective || problem) return;
            onCreate({
              id: newId(),
              handle: effective,
              title: title.trim(),
              description: "",
              showTitle: true,
              sections: [
                newSection("rich-text", { heading: "", eyebrow: "", align: "left", text: "" }),
              ],
            });
          }}
        >
          <Field>
            <FieldLabel htmlFor={`${id}-title`}>Title</FieldLabel>
            <Input
              id={`${id}-title`}
              value={title}
              maxLength={80}
              placeholder="About us"
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field data-invalid={Boolean(problem)}>
            <FieldLabel htmlFor={`${id}-handle`}>Address</FieldLabel>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">/pages/</span>
              <Input
                id={`${id}-handle`}
                value={effective}
                maxLength={48}
                placeholder="about-us"
                onChange={(e) => {
                  setTouched(true);
                  setHandle(e.target.value.toLowerCase());
                }}
              />
            </div>
            {problem && <FieldError>{problem}</FieldError>}
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={!title.trim() || !effective || Boolean(problem)}>
              Create page
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Title, address and search description of the page being edited. */
export function PageSettings({
  page,
  pages,
  onChange,
  onDelete,
}: {
  page: CustomPage;
  pages: CustomPage[];
  onChange: (page: CustomPage) => void;
  onDelete: () => void;
}) {
  const id = useId();
  const problem = handleProblem(page.handle, pages, page.id);
  return (
    <details className="group rounded-lg border bg-card">
      <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        Page settings
        <span className="ml-1 font-normal text-muted-foreground">· /pages/{page.handle}</span>
      </summary>
      <div className="space-y-4 border-t p-3">
        <Field data-invalid={!page.title.trim()}>
          <FieldLabel htmlFor={`${id}-title`}>Title</FieldLabel>
          <Input
            id={`${id}-title`}
            value={page.title}
            maxLength={80}
            onChange={(e) => onChange({ ...page, title: e.target.value })}
          />
          {!page.title.trim() && <FieldError>Give the page a title.</FieldError>}
        </Field>
        <Field data-invalid={Boolean(problem)}>
          <FieldLabel htmlFor={`${id}-handle`}>Address</FieldLabel>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">/pages/</span>
            <Input
              id={`${id}-handle`}
              value={page.handle}
              maxLength={48}
              onChange={(e) => onChange({ ...page, handle: e.target.value.toLowerCase() })}
            />
          </div>
          {problem ? (
            <FieldError>{problem}</FieldError>
          ) : (
            <FieldDescription>
              Changing it breaks links people saved to the old address.
            </FieldDescription>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-description`}>Description for search engines</FieldLabel>
          <Textarea
            id={`${id}-description`}
            value={page.description}
            maxLength={200}
            rows={2}
            onChange={(e) => onChange({ ...page, description: e.target.value })}
          />
        </Field>
        <Field orientation="horizontal" className="justify-between">
          <FieldLabel htmlFor={`${id}-show`} className="font-normal">
            Show the title at the top
          </FieldLabel>
          <Switch
            id={`${id}-show`}
            checked={page.showTitle}
            onCheckedChange={(v) => onChange({ ...page, showTitle: v })}
          />
        </Field>
        <ConfirmDialog
          trigger={
            <Button
              variant="outline"
              size="sm"
              className="w-full text-destructive hover:text-destructive"
            >
              <Trash2Icon />
              Delete page
            </Button>
          }
          title={`Delete “${page.title}”?`}
          description="The page and its sections are removed when you publish. Links to it will stop working."
          confirmLabel="Delete page"
          destructive
          onConfirm={async () => {
            onDelete();
            return true;
          }}
        />
      </div>
    </details>
  );
}
