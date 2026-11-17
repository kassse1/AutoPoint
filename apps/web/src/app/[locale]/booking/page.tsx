import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ButtonAnchor, Section, SectionHeader } from "@/components/ui/primitives";
import type { Locale } from "@/i18n/routing";
import { api } from "@/lib/api/client";
import { telegramHref, telHref, whatsappHref } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

// Phase 2 placeholder: the online booking wizard replaces this page in Phase 3.
export async function generateMetadata({ params }: PageProps<"/[locale]/booking">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const [t, site] = await Promise.all([getTranslations("Booking"), api.site(locale)]);
  return {
    ...pageMetadata({ locale, path: "/booking", title: t("metaTitle"), description: t("lead"), siteName: site.business_name }),
    robots: { index: false },
  };
}

export default async function BookingPage({ params }: PageProps<"/[locale]/booking">) {
  const locale = (await params).locale as Locale;
  const [t, tc, site] = await Promise.all([getTranslations("Booking"), getTranslations("Common"), api.site(locale)]);
  return (
    <Section>
      <SectionHeader as="h1" eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />
      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <ButtonAnchor href={telHref(site.phone)}>{tc("call")}</ButtonAnchor>
        {site.whatsapp && (
          <ButtonAnchor variant="secondary" href={whatsappHref(site.whatsapp, tc("whatsappText", { business: site.business_name }))}>
            WhatsApp
          </ButtonAnchor>
        )}
        {site.telegram && (
          <ButtonAnchor variant="secondary" href={telegramHref(site.telegram)}>
            Telegram
          </ButtonAnchor>
        )}
      </div>
    </Section>
  );
}
