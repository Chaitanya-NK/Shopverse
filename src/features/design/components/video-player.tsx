"use client";

/* eslint-disable @next/next/no-img-element -- cover image from public storage or YouTube */
import { PlayIcon } from "lucide-react";
import { useState } from "react";
import { useT } from "@/i18n/client";

/**
 * A video that loads nothing from YouTube or Vimeo until the shopper presses
 * play (faster pages, no tracking for people who don't watch).
 */
export function VideoPlayer({
  provider,
  id,
  title,
  poster,
}: {
  provider: "youtube" | "vimeo";
  id: string;
  title: string;
  poster: { src: string; srcSet?: string } | null;
}) {
  const t = useT();
  const [playing, setPlaying] = useState(false);
  const src =
    provider === "youtube"
      ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`
      : `https://player.vimeo.com/video/${encodeURIComponent(id)}?autoplay=1&dnt=1`;
  const cover =
    poster ??
    (provider === "youtube"
      ? { src: `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg` }
      : null);

  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
      {playing ? (
        <iframe
          src={src}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 size-full"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group absolute inset-0 flex items-center justify-center outline-none focus-visible:ring-4 focus-visible:ring-ring"
          aria-label={t("Play video: {title}", { title })}
        >
          {cover && (
            <img
              src={cover.src}
              srcSet={cover.srcSet}
              sizes="(min-width: 1024px) 960px, 100vw"
              alt=""
              loading="lazy"
              // A missing thumbnail leaves the plain dark frame, not a broken image.
              onError={(e) => {
                e.currentTarget.hidden = true;
              }}
              className="absolute inset-0 size-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
            />
          )}
          <span className="relative flex size-16 items-center justify-center rounded-full bg-white/90 text-black shadow-lg transition-transform group-hover:scale-105">
            <PlayIcon className="ml-1 size-7 fill-current" aria-hidden />
          </span>
        </button>
      )}
    </div>
  );
}
