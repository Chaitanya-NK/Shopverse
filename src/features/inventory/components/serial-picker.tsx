"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/** Tick the units to move: filter, select all, or scan a serial to tick it. */
export function SerialPicker({
  options,
  value,
  onChange,
  max,
}: {
  options: string[] | null;
  value: string[];
  onChange: (value: string[]) => void;
  /** Stop ticking once this many are selected (e.g. the quantity to ship). */
  max?: number;
}) {
  const [filter, setFilter] = useState("");
  if (options === null) {
    return (
      <div className="flex justify-center rounded-lg border py-6">
        <Spinner />
      </div>
    );
  }
  if (options.length === 0) {
    return (
      <p className="rounded-lg border p-3 text-sm text-muted-foreground">No units in stock here.</p>
    );
  }

  const needle = filter.trim().toUpperCase();
  const visible = needle ? options.filter((s) => s.includes(needle)) : options;
  const selected = new Set(value);
  const full = max !== undefined && value.length >= max;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={filter}
          placeholder="Filter or scan a serial"
          aria-label="Filter serial numbers"
          className="font-mono"
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            // A scanner "types" the serial and presses Enter: tick an exact match.
            if (e.key === "Enter") {
              e.preventDefault();
              if (options.includes(needle) && !selected.has(needle) && !full)
                onChange([...value, needle]);
              setFilter("");
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange([...new Set([...value, ...visible])].slice(0, max))}
        >
          Select {needle ? "shown" : "all"}
        </Button>
      </div>
      <ul
        className="max-h-48 divide-y overflow-y-auto rounded-lg border"
        aria-label="Units in stock"
      >
        {visible.map((serial) => (
          <li key={serial}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 font-mono text-sm hover:bg-muted/50">
              <Checkbox
                checked={selected.has(serial)}
                disabled={full && !selected.has(serial)}
                onCheckedChange={(checked) =>
                  onChange(
                    checked === true ? [...value, serial] : value.filter((s) => s !== serial),
                  )
                }
              />
              {serial}
            </label>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted-foreground">No match.</li>
        )}
      </ul>
    </div>
  );
}
