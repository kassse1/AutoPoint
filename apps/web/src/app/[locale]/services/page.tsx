import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CtaBand } from "@/components/site/Blocks";
import { ServiceCardView } from "@/components/site/ServiceCard";
import { Section, SectionHeader } from "@/components/ui/primitives";
import type { Locale } from "@/i18n/routing";
import { api } from "@/lib/api/client";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/services">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const [t, site] = await Promise.all([getTranslations("Services"), api.site(locale)]);
  return pageMetadata({
    locale,
    path: "/services",
    title: t("metaTitle"),
    description: t("metaDescription"),
    siteName: site.business_name,
  });
}

export default async function ServicesPage({ params }: PageProps<"/[locale]/services">) {
  const locale = (await params).locale as Locale;
  const [t, tc, categories, services, vehicles] = await Promise.all([
    getTranslations("Services"),
    getTranslations("Common"),
    api.categories(locale),
    api.services(locale),
    api.vehicleCategories(locale),
  ]);
  const groups = categories
    .map((c) => ({ ...c, services: services.filter((s) => s.category_slug === c.slug) }))
    .filter((g) => g.services.length > 0);

  return (
    <>
      <Section className="pb-0 sm:pb-0">
        <SectionHeader as="h1" eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />
        <nav aria-label={t("categoriesNav")} className="mt-10 border-y border-line">
          <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {groups.map((g) => (
              <li key={g.slug}>
                <a
                  href={`#${g.slug}`}
                  className="inline-flex min-h-12 items-center px-3 text-sm whitespace-nowrap text-fg-muted transition-colors hover:text-fg"
                >
                  {g.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </Section>

      {groups.map((g) => (
        <section key={g.slug} id={g.slug} aria-labelledby={`${g.slug}-title`} className="scroll-mt-20 pt-16">
          <div className="container-page">
            <h2 id={`${g.slug}-title`} className="font-display text-2xl font-semibold sm:text-3xl">
              {g.name}
            </h2>
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {g.services.map((s) => (
                <li key={s.slug}>
                  <ServiceCardView service={s} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <Section>
        <div className="grid gap-10 border border-line p-8 sm:p-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 className="font-display text-2xl font-semibold sm:text-3xl">{t("vehicles.title")}</h2>
            <p className="mt-4 leading-relaxed text-fg-muted">{t("vehicles.lead")}</p>
            <p className="mt-6 text-xs text-fg-muted">{tc("priceNote")}</p>
          </div>
          <dl className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
            {vehicles.map((v) => (
              <div key={v.code} className="border-t border-line pt-4">
                <dt className="font-semibold">{v.name}</dt>
                {v.examples && <dd className="mt-1 text-sm text-fg-muted">{v.examples}</dd>}
              </div>
            ))}
          </dl>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
