import { Check } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CtaBand, GalleryFigure } from "@/components/site/Blocks";
import { DurationText, PriceText, ServiceCardView } from "@/components/site/ServiceCard";
import { Media } from "@/components/ui/Media";
import { ButtonAnchor, ButtonLink, Section } from "@/components/ui/primitives";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { api, type ServiceDetail, type Site } from "@/lib/api/client";
import { formatKzt, whatsappHref } from "@/lib/format";
import { absoluteUrl, jsonLd, pageMetadata } from "@/lib/seo";

type Props = PageProps<"/[locale]/services/[slug]">;

// Rendered on first request, then cached like the other pages (see [locale]/layout.tsx).
export function generateStaticParams() {
  return [];
}

async function load(params: Props["params"]) {
  const { locale, slug } = await params;
  const service = await api.service(locale as Locale, slug);
  if (!service) notFound();
  return { locale: locale as Locale, service };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, service } = await load(params);
  const site = await api.site(locale);
  return pageMetadata({
    locale,
    path: `/services/${service.slug}`,
    title: service.name,
    description: service.summary,
    siteName: site.business_name,
  });
}

function serviceJsonLd(service: ServiceDetail, site: Site, locale: Locale, labels: { home: string; services: string }) {
  const url = absoluteUrl(locale, `/services/${service.slug}`);
  const prices = service.prices.map((p) => p.price_kzt);
  return [
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: service.name,
      description: service.description,
      url,
      serviceType: service.category_name,
      provider: { "@type": "AutomotiveBusiness", name: site.business_name, url: absoluteUrl(locale, "/") },
      areaServed: site.city,
      ...(prices.length > 0 && {
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: "KZT",
          lowPrice: Math.min(...prices),
          highPrice: Math.max(...prices),
          offerCount: prices.length,
        },
      }),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: labels.home, item: absoluteUrl(locale, "/") },
        { "@type": "ListItem", position: 2, name: labels.services, item: absoluteUrl(locale, "/services") },
        { "@type": "ListItem", position: 3, name: service.name, item: url },
      ],
    },
  ];
}

export default async function ServicePage({ params }: Props) {
  const { locale, service } = await load(params);
  const [t, tc, tn, site, vehicles, gallery] = await Promise.all([
    getTranslations("Service"),
    getTranslations("Common"),
    getTranslations("Nav"),
    api.site(locale),
    api.vehicleCategories(locale),
    api.gallery(locale, { service: service.slug }),
  ]);
  const vehicleName = new Map(vehicles.map((v) => [v.code, v.name]));
  const vehicleCodes = service.prices.map((p) => p.vehicle_code);
  const optionPrice = (prices: ServiceDetail["options"][number]["prices"], code: string) =>
    prices.find((p) => p.vehicle_code === code)?.price_kzt;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(serviceJsonLd(service, site, locale, { home: tn("home"), services: tn("services") })),
        }}
      />

      <section className="border-b border-line">
        <div className="container-page pt-10 sm:pt-14">
          <nav aria-label={t("breadcrumbs")}>
            <ol className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
              <li>
                <Link href="/" className="hover:text-fg">
                  {tn("home")}
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link href="/services" className="hover:text-fg">
                  {tn("services")}
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-fg">
                {service.name}
              </li>
            </ol>
          </nav>
          <div className="mt-10 grid gap-10 pb-14 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-7">
              <p className="eyebrow">{service.category_name}</p>
              <h1 className="mt-4 font-display text-4xl leading-tight font-semibold tracking-tight sm:text-6xl">
                {service.name}
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-fg-muted">{service.summary}</p>
            </div>
            <div className="border-t border-line pt-6 lg:col-span-5">
              <dl className="grid grid-cols-2 gap-6">
              <div>
                <dt className="text-xs tracking-[0.12em] text-fg-muted uppercase">{t("price")}</dt>
                <dd className="mt-2 font-display text-2xl font-semibold text-accent tabular-nums">
                  <PriceText service={service} />
                </dd>
              </div>
              <div>
                <dt className="text-xs tracking-[0.12em] text-fg-muted uppercase">{t("duration")}</dt>
                <dd className="mt-2 font-display text-2xl font-semibold">
                  <DurationText min={service.duration_min} max={service.duration_max} />
                </dd>
              </div>
              </dl>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href={{ pathname: "/booking", query: { service: service.slug } }}>{t("book")}</ButtonLink>
                {site.whatsapp && (
                  <ButtonAnchor
                    variant="secondary"
                    href={whatsappHref(site.whatsapp, tc("whatsappServiceText", { service: service.name }))}
                  >
                    {t("ask")}
                  </ButtonAnchor>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="container-page pb-14">
          <Media src={service.image_url} alt={service.name} demo={service.slug} priority className="aspect-[16/9] sm:aspect-[21/9]" />
        </div>
      </section>

      <Section>
        <div className="grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <h2 className="font-display text-2xl font-semibold sm:text-3xl">{t("about")}</h2>
            <p className="mt-6 text-lg leading-relaxed text-fg-muted">{service.description}</p>
            <h2 className="mt-14 font-display text-2xl font-semibold sm:text-3xl">{t("benefits")}</h2>
            <ul className="mt-6 grid gap-4 sm:grid-cols-3">
              {service.benefits.map((b) => (
                <li key={b} className="border-t border-accent/60 pt-4 text-sm leading-relaxed">
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-5">
            <div className="border border-line bg-surface/40 p-8">
              <h2 className="font-display text-xl font-semibold">{t("includes")}</h2>
              <ul className="mt-6 space-y-4">
                {service.includes.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-relaxed">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={2} aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Section>

      <Section className="border-t border-line">
        <h2 className="font-display text-2xl font-semibold sm:text-3xl">{t("process")}</h2>
        <ol className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {service.process.map((step, i) => (
            <li key={step.title} className="border-t border-line pt-6">
              <span className="font-display text-sm text-accent tabular-nums">0{i + 1}</span>
              <h3 className="mt-3 font-display text-lg font-semibold">{step.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </Section>

      {service.prices.length > 0 && (
        <Section className="border-t border-line" id="prices">
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">{t("prices.title")}</h2>
          <p className="mt-4 max-w-2xl text-fg-muted">{t("prices.lead")}</p>
          <div className="mt-10 overflow-x-auto border border-line">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">{t("prices.caption", { service: service.name })}</caption>
              <thead className="bg-surface text-xs tracking-[0.1em] text-fg-muted uppercase">
                <tr>
                  <th scope="col" className="p-4 font-medium">
                    {t("prices.item")}
                  </th>
                  {vehicleCodes.map((code) => (
                    <th key={code} scope="col" className="p-4 text-right font-medium">
                      {vehicleName.get(code) ?? code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line tabular-nums">
                <tr>
                  <th scope="row" className="p-4 font-semibold">
                    {t("prices.base")}
                  </th>
                  {service.prices.map((p) => (
                    <td key={p.vehicle_code} className="p-4 text-right font-semibold text-accent">
                      {formatKzt(p.price_kzt, locale)}
                    </td>
                  ))}
                </tr>
                {service.options.map((o) => (
                  <tr key={o.code}>
                    <th scope="row" className="p-4 font-normal">
                      {o.name}
                    </th>
                    {vehicleCodes.map((code) => {
                      const price = optionPrice(o.prices, code);
                      return (
                        <td key={code} className="p-4 text-right text-fg-muted">
                          {price == null ? "—" : price === 0 ? t("prices.included") : `+${formatKzt(price, locale)}`}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-fg-muted">{tc("priceNote")}</p>
        </Section>
      )}

      {gallery.length > 0 && (
        <Section className="border-t border-line">
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">{t("gallery")}</h2>
          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            {gallery.map((item) => (
              <GalleryFigure key={item.id} item={item} sizes="(min-width: 1024px) 50vw, 100vw" />
            ))}
          </div>
        </Section>
      )}

      {service.related.length > 0 && (
        <Section className="border-t border-line">
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">{t("related")}</h2>
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {service.related.map((s) => (
              <li key={s.slug}>
                <ServiceCardView service={s} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <CtaBand />
    </>
  );
}
