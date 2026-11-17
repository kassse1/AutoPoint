import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { api } from "@/lib/api/client";
import { absoluteUrl } from "@/lib/seo";

// Built per request (cached through the API fetch), so builds don't need the API.
export const dynamic = "force-dynamic";

const STATIC_PATHS = ["/", "/services", "/gallery", "/about", "/contacts", "/privacy"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [site, services] = await Promise.all([
    api.site(routing.defaultLocale),
    api.services(routing.defaultLocale),
  ]);
  const paths = [...STATIC_PATHS, ...services.map((s) => `/services/${s.slug}`)];
  const locales = routing.locales.filter((l) => site.enabled_locales.includes(l));
  return paths.map((path) => ({
    url: absoluteUrl(routing.defaultLocale, path),
    alternates: { languages: Object.fromEntries(locales.map((l) => [l, absoluteUrl(l, path)])) },
  }));
}
