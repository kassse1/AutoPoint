import { ArrowRight, CalendarCheck, CalendarClock, Camera, Lamp, Receipt, Ruler, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { CtaBand, GalleryFigure, ReviewCard } from "@/components/site/Blocks";
import { MapEmbed } from "@/components/site/MapEmbed";
import { OpeningHoursList } from "@/components/site/OpeningHours";
import { ServiceCardView } from "@/components/site/ServiceCard";
import { DEMO_HERO, unsplashImg } from "@/lib/demoPhotos";
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
const POINTS = [
  { key: "1", icon: ShieldCheck },
  { key: "2", icon: CalendarClock },
  { key: "3", icon: Camera },
] as const;

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

      <section className="relative overflow-hidden border-b border-line bg-bg">
        {site.hero_image_url ? (
          <Image src={site.hero_image_url} alt="" fill priority sizes="100vw" className="object-cover object-[50%_60%]" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- resized by Unsplash's CDN, see unsplashImg
          <img
            {...unsplashImg(DEMO_HERO)}
            alt=""
            sizes="100vw"
            fetchPriority="high"
            className="absolute inset-0 h-full w-full object-cover object-[50%_60%]"
          />
        )}
        {/* Darken top and bottom so the headline and the strip stay readable on any photo. */}
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(8_8_10/0.9),rgb(8_8_10/0.45)_40%,rgb(8_8_10/0.25)_60%,rgb(8_8_10/0.95))]" />
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgb(8_8_10/0.7))]" />
        <div className="container-page relative pt-12 text-center sm:pt-16">
          <p className="eyebrow">{t("hero.eyebrow", { city: site.city })}</p>
          <h1 className="mt-6 font-headline text-[clamp(2.4rem,7vw,5.25rem)] leading-[1] font-semibold tracking-[0.06em] uppercase">
            <span className="block">{t("hero.title")}</span>
            <span className="block text-accent">{t("hero.titleAccent")}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-fg/80">{t("hero.lead")}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/booking">
              {t("hero.primary")}
              <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
            </ButtonLink>
            <ButtonLink href="/services" variant="secondary">
              {t("hero.secondary")}
            </ButtonLink>
          </div>

          <div className="mt-2 grid items-center gap-8 lg:grid-cols-[10rem_1fr_12rem]">
            <div aria-hidden="true" className="hidden lg:block" />
            {/* The photo is the section background; this keeps its car visible between text and strip. */}
            <div role="img" aria-label={t("hero.imageAlt")} className="relative h-[clamp(12rem,30vw,26rem)]">
              {!site.hero_image_url && (
                <span className="absolute right-0 bottom-0 rounded-full bg-black/50 px-2 py-0.5 text-[10px] tracking-[0.12em] text-fg/70 uppercase backdrop-blur">
                  {tc("illustration")}
                </span>
              )}
            </div>
            <ul className="grid gap-6 text-left sm:grid-cols-3 lg:grid-cols-1">
              {POINTS.map(({ key, icon: Icon }) => (
                <li key={key} className="flex gap-3 lg:flex-col">
                  <Icon className="size-7 shrink-0 text-accent" strokeWidth={1.25} aria-hidden="true" />
                  <span className="text-sm leading-snug text-fg/85">{t(`hero.points.${key}`)}</span>
                </li>
              ))}
            </ul>
          </div>

          <ul className="relative -mx-1 mt-10 mb-12 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-left shadow-[0_30px_80px_-30px_#000] backdrop-blur-xl sm:grid-cols-2 lg:grid-cols-4">
            {WHY.map(({ key, icon: Icon }) => (
              <li key={key} className="flex gap-5 bg-surface/80 p-6 lg:p-7">
                <Icon className="size-8 shrink-0 text-accent" strokeWidth={1.25} aria-hidden="true" />
                <div>
                  <h2 className="text-xs font-semibold tracking-[0.16em] uppercase">{t(`why.items.${key}.title`)}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{t(`why.items.${key}.text`)}</p>
                </div>
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
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {pairs.slice(0, 3).map((item, i) => (
              <GalleryFigure
                key={item.id}
                item={item}
                className={`reveal ${i === 0 ? "lg:col-span-2" : ""}`}
                aspect={i === 0 ? "aspect-[4/3] sm:aspect-[21/9]" : "aspect-[16/10]"}
                sizes={i === 0 ? "(min-width: 1320px) 1280px, 100vw" : "(min-width: 1024px) 50vw, 100vw"}
              />
            ))}
          </div>
        </Section>
      )}

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
