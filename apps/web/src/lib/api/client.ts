import type { components } from "./schema";
import type { Locale } from "@/i18n/routing";

export type Schemas = components["schemas"];
export type Site = Schemas["SiteOut"];
export type ServiceCard = Schemas["ServiceCard"];
export type ServiceDetail = Schemas["ServiceDetail"];
export type GalleryItem = Schemas["GalleryItem"];
export type Review = Schemas["ReviewOut"];
export type TeamMember = Schemas["TeamMember"];
export type VehicleCategory = Schemas["VehicleCategoryOut"];
export type Category = Schemas["CategoryOut"];

// Server-side only: the browser never talks to this URL directly.
const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:8000";
const REVALIDATE_SECONDS = 60;

type Params = Record<string, string | boolean | undefined>;

async function request<T>(path: string, params: Params = {}): Promise<T | null> {
  const url = new URL(`/api/v1/public${path}`, API_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status} for ${url.pathname}`);
  return (await res.json()) as T;
}

async function required<T>(path: string, params?: Params): Promise<T> {
  const data = await request<T>(path, params);
  if (data === null) throw new Error(`API returned 404 for ${path}`);
  return data;
}

export const api = {
  site: (locale: Locale) => required<Site>("/site", { locale }),
  categories: (locale: Locale) => required<Category[]>("/service-categories", { locale }),
  vehicleCategories: (locale: Locale) =>
    required<VehicleCategory[]>("/vehicle-categories", { locale }),
  services: (locale: Locale, filter: { category?: string; featured?: boolean } = {}) =>
    required<ServiceCard[]>("/services", { locale, ...filter }),
  service: (locale: Locale, slug: string) =>
    request<ServiceDetail>(`/services/${encodeURIComponent(slug)}`, { locale }),
  gallery: (locale: Locale, filter: { service?: string; kind?: string } = {}) =>
    required<GalleryItem[]>("/gallery", { locale, ...filter }),
  reviews: () => required<Review[]>("/reviews"),
  team: (locale: Locale) => required<TeamMember[]>("/team", { locale }),
};
