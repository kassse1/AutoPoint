import { CalendarCheck, Lamp, Receipt, Ruler } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CtaBand, GalleryFigure, ReviewCard } from "@/components/site/Blocks";
import { MapEmbed } from "@/components/site/MapEmbed";
import { OpeningHoursList } from "@/components/site/OpeningHours";
import { ServiceCardView } from "@/components/site/ServiceCard";
import { Media } from "@/components/ui/Media";
import { ButtonAnchor, ButtonLink, Section, SectionHeader } from "@/components/ui/primitives";
import type { Locale } from "@/i18n/routing";
import { api, type Site } from "@/lib/api/client";
import { telHref, whatsappHref } from "@/lib/format";
import { absoluteUrl, jsonLd, pageMetadata } from "@/lib/seo";

const WHY = [
  { key: "1", icon: Receipt },
  { key: "2", icon: Ruler },
  { key: "3", icon: Lamp },
  { key: "4", icon: CalendarCheck },
] as const;
const STEPS = ["1", "2", "3", "4"] as const;
const FAQ = ["1", "2", "3", "4", "5", "6"] as const;
const POINTS = ["1", "2", "3"] as const;

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const site = await api.site(locale);
  const meta = pageMetadata({
    locale,
    path: "/",
    title: site.seo_title,
    description: site.seo_description,
    siteName: site.business_name,
  });
  return { ...meta, title: { absolute: site.seo_title } };
}

function businessJsonLd(site: Site, locale: Locale) {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return {
    "@context": "https://schema.org",
    "@type": "AutomotiveBusiness",
    name: site.business_name,
    url: absoluteUrl(locale, "/"),
    telephone: site.phone,
    email: site.email ?? undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: site.address,
      addressLocality: site.city,
      addressCountry: "KZ",
    },
    geo: { "@type": "GeoCoordinates", latitude: site.latitude, longitude: site.longitude },
    openingHoursSpecification: site.hours.map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: days[h.weekday - 1],
      opens: h.opens,
      closes: h.closes,
    })),
    currenciesAccepted: site.currency,
    sameAs: site.instagram_url ? [site.instagram_url] : undefined,
  };
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const locale = (await params).locale as Locale;
  const [t, tc, site, featured, pairs, reviews] = await Promise.all([
    getTranslations("Home"),
    getTranslations("Common"),
    api.site(locale),
    api.services(locale, { featured: true }),
    api.gallery(locale, { kind: "before_after" }),
    api.reviews(),
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(businessJsonLd(site, locale)) }} />

      <section className="border-b border-line">
        <div className="container-page pt-14 sm:pt-24">
          <p className="eyebrow">{t("hero.eyebrow", { city: site.city })}</p>
          <div className="mt-6 grid gap-8 lg:grid-cols-12 lg:items-end">
            <h1 className="font-display text-[2.5rem] leading-[1.04] font-semibold tracking-tight sm:text-6xl lg:col-span-8 lg:text-7xl">
              {t("hero.title")}
            </h1>
            <div className="lg:col-span-4">
              <p className="text-lg leading-relaxed text-fg-muted">{t("hero.lead")}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/booking">{t("hero.primary")}</ButtonLink>
                <ButtonLink href="/services" variant="secondary">
                  {t("hero.secondary")}
                </ButtonLink>
              </div>
            </div>
          </div>
          <Media src={null} alt={t("hero.imageAlt")} variant="after" priority className="mt-12 aspect-[16/9] sm:aspect-[21/9]" />
          <ul className="grid border-t border-line sm:grid-cols-3">
            {POINTS.map((p, i) => (
              <li key={p} className="flex gap-4 border-line py-6 sm:border-l sm:px-6 sm:first:border-l-0 sm:first:pl-0">
                <span className="text-xs text-accent tabular-nums">0{i + 1}</span>
                <span className="text-sm leading-relaxed">{t(`hero.points.${p}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Section>
        <SectionHeader eyebrow={t("featured.eyebrow")} title={t("featured.title")} lead={t("featured.lead")}>
          <ButtonLink href="/services" variant="secondary" className="self-start md:self-auto">
            {tc("allServices")}
          </ButtonLink>
        </SectionHeader>
        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((s) => (
            <li key={s.slug} className="reveal">
              <ServiceCardView service={s} />
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-fg-muted">{tc("priceNote")}</p>
      </Section>

      {pairs.length > 0 && (
        <Section className="border-t border-line">
          <SectionHeader eyebrow={t("results.eyebrow")} title={t("results.title")} lead={t("results.lead")}>
            <ButtonLink href="/gallery" variant="secondary" className="self-start md:self-auto">
              {t("results.cta")}
            </ButtonLink>
          </SectionHeader>
          <div className="mt-12 grid gap-10 lg:grid-cols-2">
            {pairs.slice(0, 2).map((item) => (
              <GalleryFigure key={item.id} item={item} sizes="(min-width: 1024px) 50vw, 100vw" />
            ))}
          </div>
        </Section>
      )}

      <Section className="border-t border-line">
        <SectionHeader eyebrow={t("why.eyebrow")} title={t("why.title")} />
        <ul className="mt-12 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {WHY.map(({ key, icon: Icon }) => (
            <li key={key} className="bg-bg p-8">
              <Icon className="size-6 text-accent" strokeWidth={1.5} aria-hidden="true" />
              <h3 className="mt-6 font-display text-lg font-semibold">{t(`why.items.${key}.title`)}</h3>
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">{t(`why.items.${key}.text`)}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section className="border-t border-line">
        <SectionHeader eyebrow={t("process.eyebrow")} title={t("process.title")} lead={t("process.lead")} />
        <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s} className="border-t border-line pt-6">
              <span className="font-display text-sm text-accent tabular-nums">0{i + 1}</span>
              <h3 className="mt-3 font-display text-lg font-semibold">{t(`process.steps.${s}.title`)}</h3>
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">{t(`process.steps.${s}.text`)}</p>
            </li>
          ))}
        </ol>
      </Section>

      {reviews.length > 0 && (
        <Section className="border-t border-line">
          <SectionHeader eyebrow={t("reviews.eyebrow")} title={t("reviews.title")} />
          <ul className="mt-12 grid gap-6 lg:grid-cols-3">
            {reviews.slice(0, 3).map((r) => (
              <li key={r.id}>
                <ReviewCard review={r} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section className="border-t border-line">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionHeader eyebrow={t("faq.eyebrow")} title={t("faq.title")} />
          </div>
          <div className="divide-y divide-line border-y border-line lg:col-span-8">
            {FAQ.map((q) => (
              <details key={q} className="group py-2">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 font-medium [&::-webkit-details-marker]:hidden">
                  {t(`faq.items.${q}.q`)}
                  <span aria-hidden="true" className="text-xl text-accent transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="pb-5 leading-relaxed text-fg-muted">{t(`faq.items.${q}.a`)}</p>
              </details>
            ))}
          </div>
        </div>
      </Section>

      <Section className="border-t border-line">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionHeader eyebrow={t("location.eyebrow")} title={t("location.title")} />
            <p className="mt-8 text-lg">{site.address}</p>
            <OpeningHoursList hours={site.hours} className="mt-8 max-w-sm text-sm" />
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <ButtonAnchor href={telHref(site.phone)}>{tc("call")}</ButtonAnchor>
              {site.whatsapp && (
                <ButtonAnchor
                  variant="secondary"
                  href={whatsappHref(site.whatsapp, tc("whatsappText", { business: site.business_name }))}
                >
                  WhatsApp
                </ButtonAnchor>
              )}
            </div>
          </div>
          <div className="lg:col-span-7">
            <MapEmbed
              lat={site.latitude}
              lng={site.longitude}
              title={t("location.mapTitle", { business: site.business_name })}
              loadLabel={tc("mapLoad")}
              notice={tc("mapNotice")}
            />
          </div>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
