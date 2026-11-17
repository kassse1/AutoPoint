import { Mail, MessageCircle, Phone, Send } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MapEmbed } from "@/components/site/MapEmbed";
import { OpeningHoursList } from "@/components/site/OpeningHours";
import { Section, SectionHeader } from "@/components/ui/primitives";
import type { Locale } from "@/i18n/routing";
import { api } from "@/lib/api/client";
import { phoneDisplay, telegramHref, telHref, whatsappHref } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/contacts">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const [t, site] = await Promise.all([getTranslations("Contacts"), api.site(locale)]);
  return pageMetadata({
    locale,
    path: "/contacts",
    title: t("metaTitle"),
    description: t("metaDescription", { address: site.address }),
    siteName: site.business_name,
  });
}

export default async function ContactsPage({ params }: PageProps<"/[locale]/contacts">) {
  const locale = (await params).locale as Locale;
  const [t, tc, site] = await Promise.all([getTranslations("Contacts"), getTranslations("Common"), api.site(locale)]);

  const channels = [
    { icon: Phone, label: t("phone"), value: phoneDisplay(site.phone), href: telHref(site.phone) },
    site.whatsapp && {
      icon: MessageCircle,
      label: "WhatsApp",
      value: phoneDisplay(site.whatsapp),
      href: whatsappHref(site.whatsapp, tc("whatsappText", { business: site.business_name })),
    },
    site.telegram && { icon: Send, label: "Telegram", value: `@${site.telegram}`, href: telegramHref(site.telegram) },
    site.email && { icon: Mail, label: t("email"), value: site.email, href: `mailto:${site.email}` },
  ].filter((c) => !!c);

  return (
    <Section>
      <SectionHeader as="h1" eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />
      {site.is_demo && <p className="mt-6 max-w-2xl text-sm text-warning">{t("demoNotice")}</p>}

      <ul className="mt-12 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {channels.map(({ icon: Icon, label, value, href }) => (
          <li key={label} className="bg-bg">
            <a
              href={href}
              {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="flex h-full flex-col gap-4 p-8 transition-colors hover:bg-surface"
            >
              <Icon className="size-6 text-accent" strokeWidth={1.5} aria-hidden="true" />
              <span className="text-xs tracking-[0.12em] text-fg-muted uppercase">{label}</span>
              <span className="font-display text-lg font-semibold break-all tabular-nums">{value}</span>
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-16 grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <h2 className="font-display text-2xl font-semibold">{t("address")}</h2>
          <address className="mt-4 text-lg not-italic">{site.address}</address>
          {site.map_links.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-2">
              {site.map_links.map((m) => (
                <li key={m.provider}>
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center border border-line px-4 text-sm hover:border-fg/50"
                  >
                    {t(`mapProviders.${m.provider}`)}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <h2 className="mt-12 font-display text-2xl font-semibold">{t("hours")}</h2>
          <OpeningHoursList hours={site.hours} className="mt-4 max-w-sm text-sm" />
        </div>
        <div className="lg:col-span-7">
          <MapEmbed
            lat={site.latitude}
            lng={site.longitude}
            title={t("mapTitle", { business: site.business_name })}
            loadLabel={tc("mapLoad")}
            notice={tc("mapNotice")}
          />
        </div>
      </div>
    </Section>
  );
}
