"use client";

import { LanguagesIcon } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { routes } from "@/config/routes";
import { type Locale, LOCALE_NAMES, LOCALES } from "@/i18n/core";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/** English | हिन्दी, in the footer. Remembers the choice for a year. */
export function LanguageSwitcher({ shopSlug }: { shopSlug: string }) {
  const t = useT();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const back = pathname + (search ? `?${search}` : "");
  return (
    <nav aria-label={t("Language")} className="flex items-center gap-1 text-sm">
      <LanguagesIcon className="size-4 text-muted-foreground" aria-hidden />
      {LOCALES.map((locale, i) => (
        <span key={locale} className="flex items-center gap-1">
          {i > 0 && (
            <span className="text-muted-foreground" aria-hidden>
              ·
            </span>
          )}
          {locale === t.locale ? (
            <span aria-current="true" className="font-medium" lang={locale}>
              {LOCALE_NAMES[locale]}
            </span>
          ) : (
            <a
              href={routes.storefrontLanguage(shopSlug, locale, back)}
              lang={locale}
              hrefLang={locale}
              className={cn("text-muted-foreground hover:text-foreground hover:underline")}
              rel="nofollow"
            >
              {LOCALE_NAMES[locale]}
            </a>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Keeps <html lang> in step with the storefront's language (for screen readers). */
export function HtmlLang({ locale }: { locale: Locale }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
