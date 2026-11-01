"use client";

import { createContext, useContext, useMemo } from "react";

import { type Dictionary, type Locale, makeTranslate, type Translate } from "@/i18n/core";

const I18nContext = createContext<{ locale: Locale; dictionary: Dictionary | null }>({
  locale: "en",
  dictionary: null,
});

/** Storefront language for client components (the dictionary comes from the server). */
export function I18nProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale;
  dictionary: Dictionary | null;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ locale, dictionary }), [locale, dictionary]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): Translate {
  const { locale, dictionary } = useContext(I18nContext);
  return useMemo(() => makeTranslate(locale, dictionary), [locale, dictionary]);
}

/** `<T>…</T>` in server components: translated from the page's language. */
export function T({
  children,
  vars,
}: {
  children: string;
  vars?: Record<string, string | number>;
}) {
  return useT()(children, vars);
}
