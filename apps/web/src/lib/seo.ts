import type { Metadata } from "next";
import { getPathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

export const SITE_URL = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export function absoluteUrl(locale: Locale, path: string): string {
  return SITE_URL + getPathname({ locale, href: path });
}

/** Canonical + hreflang alternates + Open Graph for one localized page. */
export function pageMetadata(opts: {
  locale: Locale;
  path: string;
  title: string;
  description: string;
  siteName: string;
}): Metadata {
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, absoluteUrl(l, opts.path)]),
  );
  return {
    title: opts.title,
    description: opts.description,
    alternates: {
      canonical: absoluteUrl(opts.locale, opts.path),
      languages: { ...languages, "x-default": absoluteUrl(routing.defaultLocale, opts.path) },
    },
    openGraph: {
      type: "website",
      title: opts.title,
      description: opts.description,
      url: absoluteUrl(opts.locale, opts.path),
      siteName: opts.siteName,
      locale: opts.locale,
    },
  };
}

/** Safe JSON-LD serialization: `<` is escaped so content can't close the script tag. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
