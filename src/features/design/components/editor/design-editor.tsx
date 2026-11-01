"use client";

import {
  ArrowLeftIcon,
  CheckIcon,
  CircleAlertIcon,
  CloudIcon,
  ExternalLinkIcon,
  LayoutTemplateIcon,
  MonitorIcon,
  PaletteIcon,
  RedoIcon,
  SmartphoneIcon,
  TabletIcon,
  UndoIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { routes } from "@/config/routes";
import { discardDesignDraft, publishDesign, saveDesignDraft } from "@/features/design/actions";
import {
  EditorProvider,
  type EditorLookups,
} from "@/features/design/components/editor/editor-context";
import { FieldsForm } from "@/features/design/components/editor/fields-form";
import { PageSettings, PagesPanel } from "@/features/design/components/editor/pages-panel";
import { SectionsPanel } from "@/features/design/components/editor/sections-panel";
import { type Settings } from "@/features/design/fields";
import {
  presetDesign,
  type PresetContext,
  PRESETS,
  type PresetId,
} from "@/features/design/presets";
import { type PreviewMessage } from "@/features/design/preview";
import {
  type Design,
  designProblems,
  FOOTER_FIELDS,
  HEADER_FIELDS,
  type Section,
  sectionsOf,
  STYLE_FIELDS,
} from "@/features/design/schema";
import {
  type PageTarget,
  TEMPLATE_KEYS,
  TEMPLATES,
  type TemplateKey,
} from "@/features/design/sections";
import { cn } from "@/lib/utils";

type Props = {
  organizationSlug: string;
  shop: { id: string; name: string; slug: string; live: boolean };
  initial: {
    design: Design;
    version: number;
    hasDraft: boolean;
    publishedAt: string | null;
  };
  lookups: Omit<EditorLookups, "organizationSlug" | "shopId" | "shopSlug" | "pages">;
  presetContext: PresetContext;
  backHref: string;
  brandHref: string;
};

type SaveState = "saved" | "pending" | "saving" | "error" | "blocked";
const DEVICES = { desktop: "100%", tablet: "820px", mobile: "390px" } as const;
const HISTORY = 50;

export function DesignEditor({
  organizationSlug,
  shop,
  initial,
  lookups,
  presetContext,
  backHref,
  brandHref,
}: Props) {
  // ----------------------------------------------------------- the document
  const [design, setDesignState] = useState(initial.design);
  // The latest design, for callbacks and saves between renders.
  const designRef = useRef(initial.design);
  const [past, setPast] = useState<Design[]>([]);
  const [future, setFuture] = useState<Design[]>([]);
  const setDesign = useCallback((next: Design | ((d: Design) => Design)) => {
    const current = designRef.current;
    const value = typeof next === "function" ? next(current) : next;
    if (value === current) return;
    designRef.current = value;
    setPast((p) => [...p.slice(-HISTORY + 1), current]);
    setFuture([]);
    setDesignState(value);
  }, []);
  const undo = () => {
    const previous = past.at(-1);
    if (!previous) return;
    setPast(past.slice(0, -1));
    setFuture([designRef.current, ...future]);
    designRef.current = previous;
    setDesignState(previous);
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture(future.slice(1));
    setPast([...past, designRef.current]);
    designRef.current = next;
    setDesignState(next);
  };

  // ------------------------------------------------------------- autosave
  const [version, setVersion] = useState(initial.version);
  const [hasDraft, setHasDraft] = useState(initial.hasDraft);
  const [publishedAt, setPublishedAt] = useState(initial.publishedAt);
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initial.design));
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savedJsonRef = useRef(savedJson);
  const versionRef = useRef(initial.version);
  const saving = useRef<Promise<boolean> | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const afterSave = useRef<(() => void) | null>(null);
  const problems = useMemo(() => designProblems(design), [design]);
  const json = useMemo(() => JSON.stringify(design), [design]);
  const dirty = json !== savedJson;
  const saveState: SaveState =
    problems.length > 0
      ? "blocked"
      : isSaving
        ? "saving"
        : saveError
          ? "error"
          : dirty
            ? "pending"
            : "saved";

  const postToFrame = useCallback((message: PreviewMessage) => {
    frame.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  /** Save the latest design if it changed. Resolves true when everything is saved. */
  const flush = useCallback(async (): Promise<boolean> => {
    while (saving.current) await saving.current;
    const latest = JSON.stringify(designRef.current);
    if (latest === savedJsonRef.current) return true;
    if (designProblems(designRef.current).length > 0) return false;
    const run = (async () => {
      setIsSaving(true);
      const result = await saveDesignDraft({
        organizationSlug,
        shopId: shop.id,
        version: versionRef.current,
        design: JSON.parse(latest) as Record<string, unknown>,
      });
      setIsSaving(false);
      if (!result.ok) {
        setSaveError(result.error.message);
        return false;
      }
      versionRef.current = result.data.version;
      savedJsonRef.current = latest;
      setVersion(result.data.version);
      setSavedJson(latest);
      setHasDraft(true);
      setSaveError(null);
      postToFrame({ source: "shopverse-editor", type: "refresh" });
      afterSave.current?.();
      return true;
    })();
    saving.current = run;
    try {
      return await run;
    } finally {
      saving.current = null;
    }
  }, [organizationSlug, shop.id, postToFrame]);

  useEffect(() => {
    if (!dirty || problems.length > 0 || saveError) return;
    const timer = setTimeout(() => void flush(), 700);
    return () => clearTimeout(timer);
  }, [json, dirty, problems.length, saveError, flush]);

  // Leaving with unsaved changes.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(designRef.current) !== savedJsonRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // ------------------------------------------------------- page and frame
  const [target, setTargetState] = useState<PageTarget>("home");
  const targetRef = useRef<PageTarget>("home");
  const setTarget = useCallback((t: PageTarget) => {
    targetRef.current = t;
    setTargetState(t);
  }, []);
  const [tab, setTab] = useState("sections");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [device, setDevice] = useState<keyof typeof DEVICES>("desktop");
  const [sample, setSample] = useState({
    product: lookups.products[0]?.slug ?? null,
    collection: lookups.collections[0]?.slug ?? null,
  });
  const pathFor = useCallback(
    (t: PageTarget): string | null => {
      const base = routes.storefront(shop.slug);
      if (t === "home") return base;
      if (t === "catalogue") return `${base}/products`;
      if (t === "cart") return `${base}/cart`;
      if (t === "product") return sample.product ? `${base}/p/${sample.product}` : null;
      if (t === "collection") return sample.collection ? `${base}/c/${sample.collection}` : null;
      const page = design.pages.find((p) => `page:${p.id}` === t);
      return page ? `${base}/pages/${page.handle}` : null;
    },
    [shop.slug, sample, design.pages],
  );
  const [frameSrc, setFrameSrc] = useState(() =>
    routes.storefrontPreview(shop.slug, routes.storefront(shop.slug)),
  );
  const [frameLoading, setFrameLoading] = useState(true);

  const openTarget = (t: PageTarget) => {
    setTarget(t);
    setSelectedId(null);
    setTab("sections");
    const path = pathFor(t);
    if (path) {
      setFrameLoading(true);
      setFrameSrc(routes.storefrontPreview(shop.slug, path));
    }
  };

  // Messages from the storefront inside the frame.
  useEffect(() => {
    function onMessage(event: MessageEvent<PreviewMessage>) {
      if (event.origin !== window.location.origin || event.data?.source !== "shopverse-preview")
        return;
      if (event.data.type === "select") {
        setTab("sections");
        setSelectedId(event.data.sectionId.replace(/-\d+$/, ""));
      }
      if (event.data.type === "location") {
        setFrameLoading(false);
        const path = event.data.path.split("?")[0]!;
        const base = routes.storefront(shop.slug);
        const rest =
          path === base ? "/" : path.startsWith(`${base}/`) ? path.slice(base.length) : null;
        if (rest === null) return;
        let next: PageTarget | null = null;
        if (rest === "/") next = "home";
        else if (rest === "/products") next = "catalogue";
        else if (rest === "/cart") next = "cart";
        else if (rest.startsWith("/p/")) {
          next = "product";
          setSample((s) => ({ ...s, product: rest.slice(3) }));
        } else if (rest.startsWith("/c/")) {
          next = "collection";
          setSample((s) => ({ ...s, collection: rest.slice(3) }));
        } else if (rest.startsWith("/pages/")) {
          const page = designRef.current.pages.find((p) => p.handle === rest.slice(7));
          if (page) next = `page:${page.id}`;
        }
        if (next && next !== targetRef.current) {
          setTarget(next);
          setSelectedId(null);
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [shop.slug, setTarget]);

  useEffect(() => {
    postToFrame({ source: "shopverse-editor", type: "select", sectionId: selectedId });
  }, [selectedId, postToFrame]);

  // A new or renamed page shows in the preview once it's saved.
  const pageTarget = target.startsWith("page:")
    ? design.pages.find((p) => `page:${p.id}` === target)
    : null;
  const shownPage = useRef<string | null>(null);
  useEffect(() => {
    afterSave.current = () => {
      const page = designRef.current.pages.find((p) => `page:${p.id}` === targetRef.current);
      if (!page || shownPage.current === `${page.id}:${page.handle}`) return;
      shownPage.current = `${page.id}:${page.handle}`;
      setFrameLoading(true);
      setFrameSrc(
        routes.storefrontPreview(shop.slug, `${routes.storefront(shop.slug)}/pages/${page.handle}`),
      );
    };
  }, [shop.slug]);

  // -------------------------------------------------------------- editing
  const sections = sectionsOf(design, target) ?? [];
  const setSections = (next: Section[]) =>
    setDesign((d) =>
      target.startsWith("page:")
        ? {
            ...d,
            pages: d.pages.map((p) => (`page:${p.id}` === target ? { ...p, sections: next } : p)),
          }
        : { ...d, templates: { ...d.templates, [target]: { sections: next } } },
    );
  const setPart = (part: "style" | "header" | "footer") => (value: Settings) =>
    setDesign((d) => ({ ...d, [part]: value }));

  // ------------------------------------------------------ publish/discard
  const [isPublishing, startPublish] = useTransition();
  const publish = () =>
    startPublish(async () => {
      if (!(await flush())) {
        toast.error(problems[0] ?? saveError ?? "Fix the problems first.");
        return;
      }
      const result = await publishDesign({
        organizationSlug,
        shopId: shop.id,
        version: versionRef.current,
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      versionRef.current = result.data.version;
      setVersion(result.data.version);
      setHasDraft(false);
      setPublishedAt(new Date().toISOString());
      toast.success(
        shop.live
          ? "Published. Shoppers see the new design now."
          : "Published. Shoppers will see it when the shop goes live.",
      );
    });
  const discard = async () => {
    while (saving.current) await saving.current;
    const result = await discardDesignDraft({
      organizationSlug,
      shopId: shop.id,
      version: versionRef.current,
    });
    if (!result.ok) {
      toast.error(result.error.message);
      return false;
    }
    window.location.reload();
    return true;
  };

  // Keyboard: undo and redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const field = (e.target as HTMLElement).closest("input,textarea,[contenteditable=true]");
      if (field || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) document.getElementById("design-redo")?.click();
      else document.getElementById("design-undo")?.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const lookupsValue = useMemo<EditorLookups>(
    () => ({
      ...lookups,
      organizationSlug,
      shopId: shop.id,
      shopSlug: shop.slug,
      pages: design.pages,
    }),
    [lookups, organizationSlug, shop.id, shop.slug, design.pages],
  );

  const previewPath = pathFor(target);
  const unpublished = hasDraft || saveState !== "saved";

  return (
    <EditorProvider value={lookupsValue}>
      <div
        className="fixed inset-0 z-50 flex flex-col bg-background"
        role="region"
        aria-label="Design editor"
      >
        {/* ---------------------------------------------------------- top bar */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <Link href={backHref}>
              <ArrowLeftIcon />
              <span className="hidden sm:inline">{shop.name}</span>
            </Link>
          </Button>
          <div className="mx-1 hidden h-5 w-px bg-border sm:block" />
          <Select value={target} onValueChange={(v) => openTarget(v as PageTarget)}>
            <SelectTrigger className="w-48 sm:w-56" aria-label="Page to edit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Page layouts</SelectLabel>
                {TEMPLATE_KEYS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TEMPLATES[t].label}
                  </SelectItem>
                ))}
              </SelectGroup>
              {design.pages.length > 0 && (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Your pages</SelectLabel>
                    {design.pages.map((p) => (
                      <SelectItem key={p.id} value={`page:${p.id}`}>
                        {p.title || "Untitled page"}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </>
              )}
            </SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-1.5">
            <SaveStatus state={saveState} />
            <Button
              id="design-undo"
              variant="ghost"
              size="icon"
              aria-label="Undo"
              disabled={past.length === 0}
              onClick={undo}
            >
              <UndoIcon />
            </Button>
            <Button
              id="design-redo"
              variant="ghost"
              size="icon"
              aria-label="Redo"
              disabled={future.length === 0}
              onClick={redo}
            >
              <RedoIcon />
            </Button>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={device}
              onValueChange={(v) => v && setDevice(v as keyof typeof DEVICES)}
              className="hidden lg:flex"
              aria-label="Preview size"
            >
              <ToggleGroupItem value="desktop" aria-label="Desktop">
                <MonitorIcon />
              </ToggleGroupItem>
              <ToggleGroupItem value="tablet" aria-label="Tablet">
                <TabletIcon />
              </ToggleGroupItem>
              <ToggleGroupItem value="mobile" aria-label="Phone">
                <SmartphoneIcon />
              </ToggleGroupItem>
            </ToggleGroup>
            {previewPath && (
              <Button asChild variant="ghost" size="icon" aria-label="Preview in a new tab">
                <a
                  href={routes.storefrontPreview(shop.slug, previewPath)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLinkIcon />
                </a>
              </Button>
            )}
            {hasDraft && (
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
                    Discard
                  </Button>
                }
                title="Discard unpublished changes?"
                description="The editor goes back to the design shoppers see now. This can't be undone."
                confirmLabel="Discard changes"
                onConfirm={discard}
              />
            )}
            <Button
              onClick={publish}
              disabled={isPublishing || !unpublished || saveState === "blocked"}
            >
              {isPublishing && <Spinner />}
              Publish
            </Button>
          </div>
        </header>
        {(saveError || problems.length > 0) && (
          <div
            role="alert"
            className="flex items-center gap-2 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive"
          >
            <CircleAlertIcon className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">{problems[0] ?? saveError}</span>
            {saveError && !problems.length && (
              <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
                Reload
              </Button>
            )}
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          {/* ------------------------------------------------------ sidebar */}
          <aside className="flex w-full shrink-0 flex-col border-r lg:w-[23rem]">
            <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
              <TabsList className="m-3 mb-0 grid grid-cols-4">
                <TabsTrigger value="sections">Sections</TabsTrigger>
                <TabsTrigger value="chrome">Header</TabsTrigger>
                <TabsTrigger value="style">Style</TabsTrigger>
                <TabsTrigger value="pages">Pages</TabsTrigger>
              </TabsList>
              <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-10">
                <TabsContent value="sections" className="mt-0 space-y-4">
                  {!selectedId && (
                    <div className="space-y-1">
                      <h2 className="font-medium">
                        {target.startsWith("page:")
                          ? (pageTarget?.title ?? "Page")
                          : TEMPLATES[target as TemplateKey].label}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {target.startsWith("page:")
                          ? "One of your own pages."
                          : TEMPLATES[target as TemplateKey].description}
                      </p>
                      {!previewPath && (
                        <p className="text-sm text-muted-foreground">
                          Add a {target === "product" ? "product" : "collection"} to the shop to
                          preview this layout.
                        </p>
                      )}
                    </div>
                  )}
                  <SectionsPanel
                    target={target}
                    sections={sections}
                    onChange={setSections}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    header={
                      pageTarget && (
                        <PageSettings
                          page={pageTarget}
                          pages={design.pages}
                          onChange={(page) =>
                            setDesign((d) => ({
                              ...d,
                              pages: d.pages.map((p) => (p.id === page.id ? page : p)),
                            }))
                          }
                          onDelete={() => {
                            setDesign((d) => ({
                              ...d,
                              pages: d.pages.filter((p) => p.id !== pageTarget.id),
                            }));
                            openTarget("home");
                          }}
                        />
                      )
                    }
                  />
                </TabsContent>
                <TabsContent value="chrome" className="mt-0 space-y-6">
                  <PanelCard title="Header" description="The bar at the top of every page.">
                    <FieldsForm
                      fields={HEADER_FIELDS}
                      value={design.header}
                      onChange={setPart("header")}
                    />
                  </PanelCard>
                  <PanelCard title="Footer" description="The bottom of every page.">
                    <FieldsForm
                      fields={FOOTER_FIELDS}
                      value={design.footer}
                      onChange={setPart("footer")}
                    />
                  </PanelCard>
                </TabsContent>
                <TabsContent value="style" className="mt-0 space-y-6">
                  <PanelCard
                    title="Look and feel"
                    description="Fonts, shapes and how products are shown, on every page."
                  >
                    <FieldsForm
                      fields={STYLE_FIELDS}
                      value={design.style}
                      onChange={setPart("style")}
                    />
                    <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                      <PaletteIcon className="size-4 shrink-0" aria-hidden />
                      <span>
                        Colour and logo are on the{" "}
                        <Link
                          href={brandHref}
                          className="font-medium text-foreground underline-offset-4 hover:underline"
                        >
                          Brand
                        </Link>{" "}
                        tab.
                      </span>
                    </p>
                  </PanelCard>
                  <Presets
                    current={design.preset}
                    onApply={(id) =>
                      setDesign((d) => ({ ...presetDesign(id, presetContext), pages: d.pages }))
                    }
                  />
                </TabsContent>
                <TabsContent value="pages" className="mt-0">
                  <PagesPanel
                    pages={design.pages}
                    onChange={(pages) => setDesign((d) => ({ ...d, pages }))}
                    onOpen={(id) => openTarget(`page:${id}`)}
                  />
                </TabsContent>
              </div>
            </Tabs>
            <footer className="border-t px-3 py-2 text-xs text-muted-foreground">
              {unpublished ? (
                <span className="flex items-center gap-1.5">
                  <Badge variant="secondary">Draft</Badge> Unpublished changes, visible only to your
                  team
                </span>
              ) : publishedAt ? (
                <span>Everything is published.</span>
              ) : (
                <span>Using the standard layout.</span>
              )}
              <span className="sr-only"> Version {version}.</span>
            </footer>
          </aside>

          {/* ------------------------------------------------------ preview */}
          <div className="relative hidden min-w-0 flex-1 justify-center overflow-hidden bg-muted/50 p-4 lg:flex">
            <iframe
              ref={frame}
              key={frameSrc}
              src={frameSrc}
              title="Shop preview"
              onLoad={() => setFrameLoading(false)}
              style={{ width: DEVICES[device] }}
              className="h-full max-w-full rounded-xl border bg-background shadow-sm transition-[width] duration-300"
            />
            {frameLoading && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <Spinner className="size-6" />
              </div>
            )}
          </div>
        </div>
      </div>
    </EditorProvider>
  );
}

function SaveStatus({ state }: { state: SaveState }) {
  const content = {
    saved: { icon: <CheckIcon className="size-3.5" />, text: "Draft saved" },
    pending: { icon: <CloudIcon className="size-3.5" />, text: "Unsaved" },
    saving: { icon: <Spinner className="size-3.5" />, text: "Saving…" },
    error: { icon: <CircleAlertIcon className="size-3.5" />, text: "Not saved" },
    blocked: { icon: <CircleAlertIcon className="size-3.5" />, text: "Not saved" },
  }[state];
  return (
    <span
      role="status"
      className={cn(
        "mr-1 hidden items-center gap-1.5 text-xs text-muted-foreground md:flex",
        (state === "error" || state === "blocked") && "text-destructive",
      )}
    >
      {content.icon}
      {content.text}
    </span>
  );
}

function PanelCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-4 py-4 shadow-none">
      <CardHeader className="px-4">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-4">{children}</CardContent>
    </Card>
  );
}

function Presets({ current, onApply }: { current: string; onApply: (id: PresetId) => void }) {
  const [choice, setChoice] = useState<PresetId | null>(null);
  return (
    <PanelCard
      title="Start from a layout"
      description="Ready-made designs to adapt. Your own pages are kept."
    >
      <ul className="space-y-2">
        {(Object.keys(PRESETS) as PresetId[]).map((id) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => setChoice(id)}
              className="flex w-full items-start gap-3 rounded-lg border p-3 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LayoutTemplateIcon
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {PRESETS[id].label}
                  {current === id && <Badge variant="outline">Started from</Badge>}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {PRESETS[id].description}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={choice !== null}
        onOpenChange={(o) => !o && setChoice(null)}
        title={choice ? `Use the ${PRESETS[choice].label} layout?` : ""}
        description="This replaces the style, header, footer and every page layout in your draft. Your own pages stay. You can undo it, and nothing changes for shoppers until you publish."
        confirmLabel="Use this layout"
        destructive={false}
        onConfirm={async () => {
          if (choice) onApply(choice);
          setChoice(null);
          return true;
        }}
      />
    </PanelCard>
  );
}
