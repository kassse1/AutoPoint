import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { BookingWizard } from "@/components/booking/BookingWizard";
import { Section, SectionHeader } from "@/components/ui/primitives";
import type { Locale } from "@/i18n/routing";
import { api } from "@/lib/api/client";
import { pageMetadata } from "@/lib/seo";

// Depends on ?service=… in the URL, so it renders per request instead of being cached.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/booking">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const [t, site] = await Promise.all([getTranslations("Booking"), api.site(locale)]);
  return {
    ...pageMetadata({ locale, path: "/booking", title: t("metaTitle"), description: t("lead"), siteName: site.business_name }),
    robots: { index: false },
  };
}

export default async function BookingPage({ params, searchParams }: PageProps<"/[locale]/booking">) {
  const locale = (await params).locale as Locale;
  const requested = (await searchParams).service;
  const [t, messages, services, vehicles] = await Promise.all([
    getTranslations("Booking"),
    getMessages(),
    api.services(locale),
    api.vehicleCategories(locale),
  ]);
  const initial = typeof requested === "string" && services.some((s) => s.slug === requested) ? requested : null;
  return (
    <Section>
      <SectionHeader as="h1" eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />
      <div className="mt-12">
        <NextIntlClientProvider messages={{ Booking: messages.Booking, Common: messages.Common }}>
          <BookingWizard locale={locale} services={services} vehicles={vehicles} initialService={initial} />
        </NextIntlClientProvider>
      </div>
    </Section>
  );
}
