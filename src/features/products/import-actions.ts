"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { slugSchema } from "@/features/organizations/schemas";
import { authorizeOrganization } from "@/features/organizations/server";
import { planProductImport } from "@/features/products/csv-import";
import { loadImportContext, runImport } from "@/features/products/csv-server";
import { createAction } from "@/lib/actions/create-action";
import { CsvParseError, parseCsvRecords } from "@/lib/csv-parse";
import { Errors } from "@/lib/errors";
import { slugify } from "@/lib/slug";
import { type ServerSupabaseClient } from "@/lib/supabase/server";

const importSchema = z.object({
  organizationSlug: slugSchema,
  csv: z.string().min(1, "Choose a CSV file").max(5_000_000, "Keep the file under 5 MB"),
});

async function plan(
  supabase: ServerSupabaseClient,
  userId: string,
  input: z.output<typeof importSchema>,
) {
  const org = await authorizeOrganization(
    supabase,
    userId,
    input.organizationSlug,
    "catalog.manage",
    "Only owners, admins and managers can import products.",
  );
  let parsed;
  try {
    parsed = parseCsvRecords(input.csv);
  } catch (error) {
    if (error instanceof CsvParseError) throw Errors.validation({ csv: [error.message] });
    throw error;
  }
  if (parsed.records.length === 0)
    throw Errors.validation({ csv: ["The file has no product rows under its header."] });
  const handles = [
    ...new Set(
      parsed.records
        .map((r) => (r.handle?.trim() || slugify(r.title ?? "", 120)).toLowerCase())
        .filter(Boolean),
    ),
  ];
  const ctx = await loadImportContext(
    supabase,
    { id: org.id, slug: input.organizationSlug },
    handles,
  );
  return { org, plan: planProductImport(parsed.records, parsed.headers, ctx) };
}

/** Check a file without changing anything. */
export const previewProductImport = createAction({
  name: "products.importPreview",
  schema: importSchema,
  handler: async (input, { supabase, user }) => {
    const { plan: result } = await plan(supabase, user.id, input);
    return {
      errors: result.errors,
      products: result.products.map((p) => ({
        handle: p.handle,
        title: p.title,
        action: p.action,
        lines: p.lines,
        variantCount: p.variantCount,
        newVariants: p.newVariants,
        errors: p.errors,
      })),
    };
  },
});

/** Import every product without problems; the rest are listed back. */
export const runProductImport = createAction({
  name: "products.import",
  schema: importSchema,
  handler: async (input, { supabase, user }) => {
    const { org, plan: result } = await plan(supabase, user.id, input);
    const outcomes = await runImport(supabase, org.id, result.products);
    refresh();
    return {
      created: result.products.filter(
        (p) => p.action === "create" && outcomes.some((o) => o.ok && o.handle === p.handle),
      ).length,
      updated: result.products.filter(
        (p) => p.action === "update" && outcomes.some((o) => o.ok && o.handle === p.handle),
      ).length,
      skipped: result.products.filter((p) => !p.payload).length,
      failed: outcomes.filter((o) => !o.ok),
    };
  },
});
