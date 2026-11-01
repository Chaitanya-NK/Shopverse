"use client";

import { DownloadIcon, RotateCwIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };

/**
 * Registers the shop's service worker (production builds only, so development
 * never serves stale code) and offers "Install app" where the browser allows.
 */
export function InstallApp({ swUrl, scope }: { swUrl: string; scope: string }) {
  const t = useT();
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register(swUrl, { scope }).catch(() => {});
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [swUrl, scope]);

  if (!prompt) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await prompt.prompt();
        setPrompt(null);
      }}
    >
      <DownloadIcon />
      {t("Install app")}
    </Button>
  );
}

export function ReloadButton() {
  const t = useT();
  return (
    <Button onClick={() => window.location.reload()}>
      <RotateCwIcon />
      {t("Try again")}
    </Button>
  );
}
