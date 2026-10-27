"use client";

import { XIcon } from "lucide-react";
import { useId, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type TagInputProps = {
  value: string[];
  onChange: (value: string[]) => void;
  id?: string;
  placeholder?: string;
  maxLength?: number;
  /** Values that can't be removed (e.g. already used by products). */
  locked?: ReadonlySet<string>;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  className?: string;
};

/**
 * A list of short values entered one at a time. Enter or comma adds the typed
 * value; pasting "S, M, L" adds three. Duplicates (case-insensitive) are ignored.
 */
export function TagInput({
  value,
  onChange,
  id,
  placeholder = "Type and press Enter",
  maxLength = 60,
  locked,
  className,
  ...aria
}: TagInputProps) {
  const [draft, setDraft] = useState("");
  const hintId = useId();

  const add = (raw: string) => {
    const seen = new Set(value.map((v) => v.toLowerCase()));
    const next = [...value];
    for (const part of raw.split(",")) {
      const tag = part.trim().slice(0, maxLength);
      if (tag && !seen.has(tag.toLowerCase())) {
        seen.add(tag.toLowerCase());
        next.push(tag);
      }
    }
    if (next.length !== value.length) onChange(next);
    setDraft("");
  };

  const remove = (tag: string) => onChange(value.filter((v) => v !== tag));

  return (
    <div className={cn("space-y-2", className)}>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Added values">
          {value.map((tag) => (
            <li key={tag}>
              <Badge variant="secondary" className="gap-1 pr-1 font-normal">
                {tag}
                {!locked?.has(tag) && (
                  <button
                    type="button"
                    onClick={() => remove(tag)}
                    className="rounded-sm opacity-60 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Remove ${tag}`}
                  >
                    <XIcon className="size-3" />
                  </button>
                )}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={id}
        value={draft}
        placeholder={placeholder}
        aria-invalid={aria["aria-invalid"]}
        aria-describedby={[aria["aria-describedby"], hintId].filter(Boolean).join(" ")}
        onChange={(e) => {
          const next = e.target.value;
          if (next.includes(",")) add(next);
          else setDraft(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
            const last = value[value.length - 1]!;
            if (!locked?.has(last)) remove(last);
          }
        }}
        onBlur={() => draft && add(draft)}
      />
      <span id={hintId} className="sr-only">
        Press Enter or type a comma to add a value.
      </span>
    </div>
  );
}
