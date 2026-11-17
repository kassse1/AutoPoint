import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { ManageBooking } from "@/components/booking/ManageBooking";
import { Section } from "@/components/ui/primitives";
import type { Locale } from "@/i18n/routing";
import { api } from "@/lib/api/client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Manage");
  // Private page: never indexed, and no Referer leaks the URL to other sites.
  return { title: t("metaTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function ManagePage({ params }: PageProps<"/[locale]/booking/manage">) {
  const locale = (await params).locale as Locale;
  const [site, messages] = await Promise.all([api.site(locale), getMessages()]);
  return (
    <Section>
      <NextIntlClientProvider
        messages={{ Manage: messages.Manage, Booking: messages.Booking, Common: messages.Common }}
      >
        <ManageBooking
          locale={locale}
          site={{ business_name: site.business_name, address: site.address, whatsapp: site.whatsapp }}
        />
      </NextIntlClientProvider>
    </Section>
  );
}
