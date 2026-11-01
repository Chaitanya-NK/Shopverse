"use client";

import { useEffect, useState } from "react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [
    { label: "days", value: Math.floor(s / 86400) },
    { label: "hours", value: Math.floor((s % 86400) / 3600) },
    { label: "minutes", value: Math.floor((s % 3600) / 60) },
    { label: "seconds", value: s % 60 },
  ];
}

/** Ticks down to `endsAt`; the server already hides sections that have ended. */
export function Countdown({ endsAt }: { endsAt: string }) {
  const end = Date.parse(endsAt);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  const left = parts(now === null ? 0 : end - now);
  if (now !== null && end - now <= 0) return <p className="font-medium">This offer has ended.</p>;
  return (
    <div className="flex justify-center gap-2 sm:gap-3" role="timer" aria-live="off">
      {left.map((p) => (
        <div
          key={p.label}
          className="min-w-16 rounded-xl bg-background/15 px-3 py-2 text-center ring-1 ring-current/15"
        >
          <p className="text-2xl font-semibold tabular-nums sm:text-3xl">
            {now === null ? "–" : String(p.value).padStart(2, "0")}
          </p>
          <p className="text-xs opacity-80">{p.label}</p>
        </div>
      ))}
    </div>
  );
}
