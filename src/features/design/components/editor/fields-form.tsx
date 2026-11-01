"use client";

/* eslint-disable @next/next/no-img-element -- previews of uploaded images */
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  ImagePlusIcon,
  LinkIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { brandImageUrl } from "@/features/branding/schemas";
import { uploadDesignImage } from "@/features/design/actions";
import { useEditorLookups } from "@/features/design/components/editor/editor-context";
import {
  type DesignImage,
  defaultSettings,
  type FieldDef,
  fieldProblem,
  ICON_OPTIONS,
  newId,
  type Settings,
} from "@/features/design/fields";
import { FONTS, type FontId } from "@/features/design/fonts";
import { shopLinks } from "@/features/design/links";
import { ACCEPTED_IMAGE_TYPES } from "@/features/products/images";
import { shrinkImage } from "@/lib/images/shrink";
import { cn } from "@/lib/utils";

const NONE = "__none__";

/** A form for a set of fields. Every change hands back the whole settings object. */
export function FieldsForm({
  fields,
  value,
  onChange,
}: {
  fields: readonly FieldDef[];
  value: Settings;
  onChange: (next: Settings) => void;
}) {
  return (
    <div className="space-y-5">
      {fields.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          value={value[field.key]}
          onChange={(v) => onChange({ ...value, [field.key]: v })}
        />
      ))}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const id = useId();
  const text = typeof value === "string" ? value : "";
  const problem = fieldProblem(field, value);

  if (field.kind === "toggle")
    return (
      <Field orientation="horizontal" className="justify-between gap-4">
        <div className="space-y-0.5">
          <FieldLabel htmlFor={id} className="font-normal">
            {field.label}
          </FieldLabel>
          {field.help && <FieldDescription>{field.help}</FieldDescription>}
        </div>
        <Switch id={id} checked={value === true} onCheckedChange={(v) => onChange(v)} />
      </Field>
    );

  if (field.kind === "list") return <ListField field={field} value={value} onChange={onChange} />;

  return (
    <Field data-invalid={Boolean(problem)}>
      <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
      {field.kind === "text" && (
        <Input
          id={id}
          value={text}
          maxLength={field.max}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.kind === "textarea" && (
        <Textarea
          id={id}
          value={text}
          maxLength={field.max}
          rows={field.rows ?? 3}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.kind === "select" && (
        <Select value={text} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                <span
                  style={
                    o.value in FONTS ? { fontFamily: FONTS[o.value as FontId].stack } : undefined
                  }
                >
                  {o.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {field.kind === "icon" && (
        <Select value={text} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ICON_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {field.kind === "collection" && (
        <CollectionSelect id={id} field={field} value={text} onChange={onChange} />
      )}
      {field.kind === "category" && <CategorySelect id={id} value={text} onChange={onChange} />}
      {field.kind === "link" && <LinkInput id={id} value={text} onChange={onChange} />}
      {field.kind === "video" && (
        <Input
          id={id}
          value={text}
          inputMode="url"
          placeholder="https://www.youtube.com/watch?v=…"
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(problem)}
        />
      )}
      {field.kind === "datetime" && <IndiaDateTime id={id} value={text} onChange={onChange} />}
      {field.kind === "image" && <ImageInput value={value} onChange={onChange} />}
      {field.help && <FieldDescription>{field.help}</FieldDescription>}
      {problem && <FieldError>{problem}</FieldError>}
    </Field>
  );
}

// ---------------------------------------------------------------------------
function CollectionSelect({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: Extract<FieldDef, { kind: "collection" }>;
  value: string;
  onChange: (value: string) => void;
}) {
  const { collections } = useEditorLookups();
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Choose a collection" />
      </SelectTrigger>
      <SelectContent>
        {field.allowAuto ? (
          <SelectItem value="auto">Homepage collections</SelectItem>
        ) : (
          <SelectItem value={NONE}>None</SelectItem>
        )}
        {collections.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CategorySelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { categories } = useEditorLookups();
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Choose a category" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>None</SelectItem>
        {categories.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** "2026-11-05T18:00" in India time ⇄ an ISO timestamp. */
function IndiaDateTime({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const local = (() => {
    const t = Date.parse(value);
    if (Number.isNaN(t)) return "";
    return new Date(t + 5.5 * 3600_000).toISOString().slice(0, 16);
  })();
  return (
    <Input
      id={id}
      type="datetime-local"
      value={local}
      onChange={(e) => onChange(e.target.value ? `${e.target.value}:00+05:30` : "")}
    />
  );
}

// ---------------------------------------------------------------------------
function LinkInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { collections, categories, products, pages, policies } = useEditorLookups();
  const [open, setOpen] = useState(false);
  const choose = (link: string) => {
    onChange(link);
    setOpen(false);
  };
  return (
    <div className="flex gap-2">
      <Input
        id={id}
        value={value}
        placeholder="/c/new-arrivals or https://…"
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="icon" aria-label="Choose a page">
            <LinkIcon />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-0">
          <Command>
            <CommandInput placeholder="Find a page…" />
            <CommandList className="max-h-80">
              <CommandEmpty>Nothing found.</CommandEmpty>
              <CommandGroup heading="Shop">
                <CommandItem onSelect={() => choose(shopLinks.home)}>Home page</CommandItem>
                <CommandItem onSelect={() => choose(shopLinks.products)}>All products</CommandItem>
                <CommandItem onSelect={() => choose(shopLinks.contact)}>Contact</CommandItem>
                <CommandItem onSelect={() => choose(shopLinks.cart)}>Cart</CommandItem>
              </CommandGroup>
              {(pages.length > 0 || policies.length > 0) && (
                <CommandGroup heading="Pages">
                  {pages.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={`page ${p.title}`}
                      onSelect={() => choose(shopLinks.page(p.handle))}
                    >
                      {p.title}
                    </CommandItem>
                  ))}
                  {policies.map((p) => (
                    <CommandItem
                      key={p.handle}
                      value={`policy ${p.title}`}
                      onSelect={() => choose(shopLinks.page(p.handle))}
                    >
                      {p.title}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {collections.length > 0 && (
                <CommandGroup heading="Collections">
                  {collections.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`collection ${c.title}`}
                      onSelect={() => choose(shopLinks.collection(c.slug))}
                    >
                      {c.title}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {categories.length > 0 && (
                <CommandGroup heading="Categories">
                  {categories.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`category ${c.name}`}
                      onSelect={() => choose(shopLinks.category(c.id))}
                    >
                      {c.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {products.length > 0 && (
                <CommandGroup heading="Products">
                  {products.map((p) => (
                    <CommandItem
                      key={p.slug}
                      value={`product ${p.title} ${p.slug}`}
                      onSelect={() => choose(shopLinks.product(p.slug))}
                    >
                      {p.title}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ---------------------------------------------------------------------------
function isImage(value: unknown): value is DesignImage {
  return Boolean(value && typeof value === "object" && "path" in value);
}

function ImageInput({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const { organizationSlug, shopId } = useEditorLookups();
  const input = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const image = isImage(value) ? value : null;

  const upload = (file: File) =>
    startTransition(async () => {
      setError(null);
      const result = await uploadDesignImage({
        organizationSlug,
        shopId,
        file: await shrinkImage(file, 2560),
      });
      if (!result.ok) setError(result.error.fieldErrors?.file?.[0] ?? result.error.message);
      else onChange(result.data);
    });

  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload(file);
        }}
      />
      {image ? (
        <div className="flex items-center gap-3">
          <img
            src={brandImageUrl(image.path, "banner", "small")}
            alt=""
            className="h-16 w-24 shrink-0 rounded-md border bg-muted object-cover"
          />
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => input.current?.click()}
            >
              {isPending ? <Spinner /> : <UploadIcon />}
              Replace
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => onChange(null)}
            >
              <Trash2Icon />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="h-16 w-full border-dashed"
          disabled={isPending}
          onClick={() => input.current?.click()}
        >
          {isPending ? <Spinner /> : <ImagePlusIcon />}
          {isPending ? "Uploading…" : "Upload image"}
        </Button>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
function ListField({
  field,
  value,
  onChange,
}: {
  field: Extract<FieldDef, { kind: "list" }>;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const items = (Array.isArray(value) ? value : []) as Settings[];
  const [open, setOpen] = useState<string | null>(null);
  const update = (next: Settings[]) => onChange(next);
  const move = (i: number, by: number) => {
    const next = [...items];
    const [item] = next.splice(i, 1);
    next.splice(i + by, 0, item!);
    update(next);
  };
  const title = (item: Settings, i: number) => {
    const summary = field.summary ? item[field.summary] : null;
    const fromOptions =
      typeof summary === "string" &&
      field.fields.find((f) => f.key === field.summary)?.kind === "select"
        ? (
            field.fields.find((f) => f.key === field.summary) as Extract<
              FieldDef,
              { kind: "select" }
            >
          ).options.find((o) => o.value === summary)?.label
        : null;
    return (fromOptions ||
      (typeof summary === "string" && summary.trim()) ||
      `${capitalise(field.itemLabel)} ${i + 1}`) as string;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{field.label}</p>
        <span className="text-xs text-muted-foreground tabular-nums">
          {items.length} / {field.max}
        </span>
      </div>
      {field.help && <p className="text-sm text-muted-foreground">{field.help}</p>}
      <ul className="space-y-1.5">
        {items.map((item, i) => {
          const key = typeof item.id === "string" ? item.id : String(i);
          const thumb = Object.values(item).find(isImage);
          return (
            <li key={key} className="rounded-lg border bg-card">
              <Collapsible open={open === key} onOpenChange={(o) => setOpen(o ? key : null)}>
                <div className="flex items-center gap-1 py-1 pr-1 pl-2">
                  <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <ChevronRightIcon
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform",
                        open === key && "rotate-90",
                      )}
                      aria-hidden
                    />
                    {thumb && (
                      <img
                        src={brandImageUrl(thumb.path, "banner", "small")}
                        alt=""
                        className="size-7 shrink-0 rounded object-cover"
                      />
                    )}
                    <span className="truncate">{title(item, i)}</span>
                  </CollapsibleTrigger>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    disabled={i === 0}
                    aria-label={`Move ${title(item, i)} up`}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    disabled={i === items.length - 1}
                    aria-label={`Move ${title(item, i)} down`}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${title(item, i)}`}
                    onClick={() => update(items.filter((_, j) => j !== i))}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
                <CollapsibleContent className="border-t p-3">
                  <FieldsForm
                    fields={field.fields}
                    value={item}
                    onChange={(next) => update(items.map((it, j) => (j === i ? next : it)))}
                  />
                </CollapsibleContent>
              </Collapsible>
            </li>
          );
        })}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        disabled={items.length >= field.max}
        onClick={() => {
          const id = newId();
          update([...items, { ...defaultSettings(field.fields), id }]);
          setOpen(id);
        }}
      >
        <PlusIcon />
        Add {field.itemLabel}
      </Button>
    </div>
  );
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
