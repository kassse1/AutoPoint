"use client";

import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

const SHORT: Record<Locale, string> = { ru: "RU", kk: "KZ", en: "EN" };
const NATIVE: Record<Locale, string> = { ru: "Русский", kk: "Қазақша", en: "English" };

export function LanguageSwitcher({ locales, label }: { locales: Locale[]; label: string }) {
  const pathname = usePathname();
  const current = useLocale();
  if (locales.length < 2) return null;
  return (
    <nav aria-label={label}>
      <ul className="flex items-center gap-1 text-xs font-medium tracking-[0.12em]">
        {locales.map((l) => (
          <li key={l}>
            <Link
              href={pathname}
              locale={l}
              lang={l}
              hrefLang={l}
              aria-current={l === current ? "true" : undefined}
              className={`inline-flex min-h-11 min-w-9 items-center justify-center px-1 transition-colors ${l === current ? "text-accent" : "text-fg-muted hover:text-fg"}`}
            >
              {SHORT[l]}
              {/* The name includes the visible code (WCAG 2.5.3), plus the language for screen readers. */}
              <span className="sr-only"> — {NATIVE[l]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
