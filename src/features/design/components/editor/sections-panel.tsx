"use client";

import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  GripVerticalIcon,
  LockIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldsForm } from "@/features/design/components/editor/fields-form";
import { newId, type Settings } from "@/features/design/fields";
import { MAX_SECTIONS, newSection, type Section } from "@/features/design/schema";
import {
  allowedOn,
  isRequired,
  type PageTarget,
  SECTION_GROUPS,
  SECTION_TYPES,
  SECTIONS,
  type SectionDef,
  type SectionGroup,
  type SectionType,
} from "@/features/design/sections";
import { cn } from "@/lib/utils";

/** A one-line reminder of what a section shows. */
function summary(section: Section): string {
  const s = section.settings;
  for (const key of ["heading", "headline", "title"]) {
    if (typeof s[key] === "string" && (s[key] as string).trim()) return (s[key] as string).trim();
  }
  for (const key of ["slides", "items", "images"]) {
    if (Array.isArray(s[key]) && (s[key] as unknown[]).length > 0) {
      const n = (s[key] as unknown[]).length;
      return `${n} item${n === 1 ? "" : "s"}`;
    }
  }
  return "";
}

export function SectionsPanel({
  target,
  sections,
  onChange,
  selectedId,
  onSelect,
  header,
}: {
  target: PageTarget;
  sections: Section[];
  onChange: (next: Section[]) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Shown above the list (page settings for custom pages). */
  header?: React.ReactNode;
}) {
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const selected = sections.find((s) => s.id === selectedId);

  if (selected) {
    const def: SectionDef = SECTIONS[selected.type];
    const Icon = def.icon;
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 shrink-0"
            aria-label="Back to sections"
            onClick={() => onSelect(null)}
          >
            <ArrowLeftIcon />
          </Button>
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <h2 className="min-w-0 flex-1 truncate font-medium">{def.label}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{def.description}</p>
        {def.fields.length > 0 ? (
          <FieldsForm
            fields={def.fields}
            value={selected.settings}
            onChange={(settings: Settings) =>
              onChange(sections.map((s) => (s.id === selected.id ? { ...s, settings } : s)))
            }
          />
        ) : (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            This section has no settings.
          </p>
        )}
        {!isRequired(selected.type, target) && (
          <Button
            variant="outline"
            className="w-full text-destructive hover:text-destructive"
            onClick={() => {
              onChange(sections.filter((s) => s.id !== selected.id));
              onSelect(null);
            }}
          >
            <Trash2Icon />
            Remove section
          </Button>
        )}
      </div>
    );
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= sections.length || from === to) return;
    const next = [...sections];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {header}
      <ol className="space-y-1.5" aria-label="Sections, top to bottom">
        {sections.map((section, i) => {
          const def: SectionDef = SECTIONS[section.type];
          const Icon = def.icon;
          const required = isRequired(section.type, target);
          const text = summary(section);
          return (
            <li
              key={section.id}
              draggable
              onDragStart={(e) => {
                setDragging(section.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", section.id);
              }}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                setOver(i);
              }}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = sections.findIndex((s) => s.id === dragging);
                if (from >= 0) move(from, i);
                setDragging(null);
                setOver(null);
              }}
              className={cn(
                "group flex items-center gap-1 rounded-lg border bg-card py-1 pr-1 pl-1 transition-colors",
                section.hidden && "opacity-60",
                dragging === section.id && "opacity-40",
                over === i && dragging !== section.id && "border-primary ring-1 ring-primary",
              )}
            >
              <span
                className="cursor-grab px-1 text-muted-foreground active:cursor-grabbing"
                aria-hidden
              >
                <GripVerticalIcon className="size-4" />
              </span>
              <button
                type="button"
                onClick={() => onSelect(section.id)}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{def.label}</span>
                  {text && (
                    <span className="block truncate text-xs text-muted-foreground">{text}</span>
                  )}
                </span>
              </button>
              {required ? (
                <span
                  className="px-2 text-muted-foreground"
                  title="This page's own content: it can be moved but not removed"
                >
                  <LockIcon className="size-3.5" aria-label="Always on this page" />
                </span>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-muted-foreground"
                  aria-label={section.hidden ? `Show ${def.label}` : `Hide ${def.label}`}
                  onClick={() =>
                    onChange(
                      sections.map((s) => (s.id === section.id ? { ...s, hidden: !s.hidden } : s)),
                    )
                  }
                >
                  {section.hidden ? <EyeOffIcon /> : <EyeIcon />}
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground"
                    aria-label={`More for ${def.label}`}
                  >
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled={i === 0} onSelect={() => move(i, i - 1)}>
                    <ArrowUpIcon />
                    Move up
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={i === sections.length - 1}
                    onSelect={() => move(i, i + 1)}
                  >
                    <ArrowDownIcon />
                    Move down
                  </DropdownMenuItem>
                  {!required && !def.single && (
                    <DropdownMenuItem
                      disabled={sections.length >= MAX_SECTIONS}
                      onSelect={() => {
                        const copy = structuredClone(section);
                        copy.id = newId();
                        const next = [...sections];
                        next.splice(i + 1, 0, copy);
                        onChange(next);
                      }}
                    >
                      <CopyIcon />
                      Duplicate
                    </DropdownMenuItem>
                  )}
                  {!required && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => onChange(sections.filter((s) => s.id !== section.id))}
                      >
                        <Trash2Icon />
                        Remove
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
      </ol>
      {sections.length === 0 && (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          This page is empty. Add a section to start.
        </p>
      )}
      <Button
        className="w-full"
        variant="outline"
        disabled={sections.length >= MAX_SECTIONS}
        onClick={() => setAdding(true)}
      >
        <PlusIcon />
        Add section
      </Button>
      <p className="text-xs text-muted-foreground">
        Drag sections to reorder them, or use the{" "}
        <MoreHorizontalIcon className="inline size-3.5" aria-label="more" /> menu. Changes save as a
        draft automatically; shoppers see them when you publish.
      </p>
      <AddSectionDialog
        open={adding}
        onOpenChange={setAdding}
        target={target}
        existing={sections}
        onAdd={(type) => {
          const section = newSection(type);
          onChange([...sections, section]);
          setAdding(false);
          onSelect(section.id);
        }}
      />
    </div>
  );
}

function AddSectionDialog({
  open,
  onOpenChange,
  target,
  existing,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: PageTarget;
  existing: Section[];
  onAdd: (type: SectionType) => void;
}) {
  const available = SECTION_TYPES.filter((type) => {
    const def: SectionDef = SECTIONS[type];
    if (!allowedOn(type, target)) return false;
    if (def.single && existing.some((s) => s.type === type)) return false;
    return true;
  });
  const groups = (Object.keys(SECTION_GROUPS) as SectionGroup[])
    .map((g) => ({ group: g, types: available.filter((t) => SECTIONS[t].group === g) }))
    .filter((g) => g.types.length > 0);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add a section"
      description="Pick what to add to this page."
    >
      <CommandInput placeholder="Search sections…" />
      <CommandList className="max-h-[28rem]">
        <CommandEmpty>No sections match.</CommandEmpty>
        {groups.map(({ group, types }) => (
          <CommandGroup key={group} heading={SECTION_GROUPS[group]}>
            {types.map((type) => {
              const def: SectionDef = SECTIONS[type];
              const Icon = def.icon;
              return (
                <CommandItem
                  key={type}
                  value={`${def.label} ${def.description}`}
                  onSelect={() => onAdd(type)}
                  className="items-start gap-3 py-2.5"
                >
                  <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="block font-medium">{def.label}</span>
                    <span className="block text-xs text-muted-foreground">{def.description}</span>
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
