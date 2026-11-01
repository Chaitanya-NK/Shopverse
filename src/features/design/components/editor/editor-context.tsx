"use client";

import { createContext, useContext } from "react";

import { type CustomPage } from "@/features/design/schema";

/** Lookups every editor control may need: the shop's catalogue and where uploads go. */
export type EditorLookups = {
  organizationSlug: string;
  shopId: string;
  shopSlug: string;
  collections: { id: string; slug: string; title: string }[];
  categories: { id: string; name: string }[];
  products: { slug: string; title: string }[];
  policies: { handle: string; title: string }[];
  pages: CustomPage[];
};

const EditorContext = createContext<EditorLookups | null>(null);

export const EditorProvider = EditorContext.Provider;

export function useEditorLookups(): EditorLookups {
  const value = useContext(EditorContext);
  if (!value) throw new Error("useEditorLookups outside the design editor");
  return value;
}
