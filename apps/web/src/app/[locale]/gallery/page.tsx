import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CtaBand, GalleryFigure } from "@/components/site/Blocks";
import { GalleryFilter } from "@/components/site/GalleryFilter";
import { Section, SectionHeader } from "@/components/ui/primitives";
import type { Locale } from "@/i18n/routing";
import { api } from "@/lib/api/client";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/gallery">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const [t, site] = await Promise.all([getTranslations("Gallery"), api.site(locale)]);
  return pageMetadata({
    locale,
    path: "/gallery",
    title: t("metaTitle"),
    description: t("metaDescription"),
    siteName: site.business_name,
  });
}

export default async function GalleryPage({ params }: PageProps<"/[locale]/gallery">) {
  const locale = (await params).locale as Locale;
  const [t, categories, all] = await Promise.all([
    getTranslations("Gallery"),
    api.categories(locale),
    api.gallery(locale),
  ]);
  const items = all.filter((i) => i.kind !== "studio");
  const used = new Set(items.map((i) => i.category_slug));

  return (
    <>
      <Section>
        <SectionHeader as="h1" eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />
        {items.length === 0 ? (
          <p className="mt-12 text-fg-muted">{t("empty")}</p>
        ) : (
          <GalleryFilter
            categories={categories.filter((c) => used.has(c.slug))}
            labels={{ all: t("all"), filter: t("filter") }}
            items={items.map((item) => ({
              id: item.id,
              category: item.category_slug,
              node: <GalleryFigure item={item} sizes="(min-width: 1024px) 50vw, 100vw" />,
            }))}
          />
        )}
      </Section>
      <CtaBand />
    </>
  );
}
