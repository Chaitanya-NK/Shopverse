"use client";

import { EyeIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { type PreviewMessage } from "@/features/design/preview";

const inFrame = () => window.parent !== window;
const subscribe = () => () => {};

/**
 * On a storefront that is previewing an unpublished design. Inside the
 * editor's frame it talks to the editor (refresh after saves, highlight and
 * pick sections, report navigation); in a normal tab it shows a bar to leave
 * preview.
 */
export function PreviewBridge({ exitHref }: { exitHref: string }) {
  const framed = useSyncExternalStore(subscribe, inFrame, () => false);
  return framed ? <FrameBridge /> : <PreviewBar exitHref={exitHref} />;
}

function post(message: PreviewMessage) {
  window.parent.postMessage(message, window.location.origin);
}

function FrameBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    post({
      source: "shopverse-preview",
      type: "location",
      path: pathname + (search ? `?${search}` : ""),
    });
  }, [pathname, search]);

  useEffect(() => {
    function onMessage(event: MessageEvent<PreviewMessage>) {
      if (event.origin !== window.location.origin || event.data?.source !== "shopverse-editor")
        return;
      if (event.data.type === "refresh") router.refresh();
      if (event.data.type === "select") {
        setSelected(event.data.sectionId);
        const el = event.data.sectionId
          ? document.querySelector(`[data-section-id="${CSS.escape(event.data.sectionId)}"]`)
          : null;
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    function onClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (target.closest("a,button,input,select,textarea,label,[role=dialog]")) return;
      const section = target.closest<HTMLElement>("[data-section-id]");
      if (section?.dataset.sectionId) {
        setSelected(section.dataset.sectionId);
        post({ source: "shopverse-preview", type: "select", sectionId: section.dataset.sectionId });
      }
    }
    window.addEventListener("message", onMessage);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", onClick);
    };
  }, [router]);

  return (
    <style>{`[data-section-id]{cursor:pointer;transition:outline-color .15s}
[data-section-id]:hover{outline:2px dashed color-mix(in oklab,var(--primary) 55%,transparent);outline-offset:6px}
${selected ? `[data-section-id="${CSS.escape(selected)}"]{outline:2px solid var(--primary)!important;outline-offset:6px}` : ""}`}</style>
  );
}

function PreviewBar({ exitHref }: { exitHref: string }) {
  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 print:hidden">
      <div className="flex items-center gap-3 rounded-full border bg-background/95 py-1.5 pr-1.5 pl-4 text-sm shadow-lg backdrop-blur">
        <EyeIcon className="size-4 text-muted-foreground" aria-hidden />
        <span>Previewing unpublished design changes</span>
        <Button asChild size="sm" variant="outline" className="rounded-full">
          <a href={exitHref}>Exit preview</a>
        </Button>
      </div>
    </div>
  );
}
