"use client";

import { useQueryStates } from "nuqs";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { AUDIT_ENTITY_LABELS } from "@/features/audit/describe";
import { auditParams } from "@/features/audit/search-params";

const ALL = "__all__";
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export function AuditFilters({ people }: { people: { id: string; name: string }[] }) {
  const [isPending, startTransition] = useTransition();
  const [{ type, actor, from, to }, setParams] = useQueryStates(auditParams, {
    shallow: false,
    startTransition,
  });
  const filtered = Boolean(type || actor || from || to);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field className="w-44">
        <FieldLabel htmlFor="audit-type">What</FieldLabel>
        <Select
          value={type ?? ALL}
          onValueChange={(v) => void setParams({ type: v === ALL ? null : v, page: null })}
        >
          <SelectTrigger id="audit-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Everything</SelectItem>
            {Object.entries(AUDIT_ENTITY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field className="w-48">
        <FieldLabel htmlFor="audit-actor">Who</FieldLabel>
        <Select
          value={actor ?? ALL}
          onValueChange={(v) => void setParams({ actor: v === ALL ? null : v, page: null })}
        >
          <SelectTrigger id="audit-actor" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Anyone</SelectItem>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
            <SelectItem value="system">System & storefront</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field className="w-40">
        <FieldLabel htmlFor="audit-from">From</FieldLabel>
        <Input
          id="audit-from"
          type="date"
          defaultValue={iso(from)}
          onChange={(e) =>
            void setParams({ from: e.target.value ? new Date(e.target.value) : null, page: null })
          }
        />
      </Field>
      <Field className="w-40">
        <FieldLabel htmlFor="audit-to">To</FieldLabel>
        <Input
          id="audit-to"
          type="date"
          defaultValue={iso(to)}
          onChange={(e) =>
            void setParams({ to: e.target.value ? new Date(e.target.value) : null, page: null })
          }
        />
      </Field>
      {isPending && <Spinner className="mb-2.5" />}
      {filtered && (
        <Button
          variant="ghost"
          onClick={() =>
            void setParams({ type: null, actor: null, from: null, to: null, page: null })
          }
        >
          Clear
        </Button>
      )}
    </div>
  );
}
