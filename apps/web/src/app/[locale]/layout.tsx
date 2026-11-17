import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import type { CSSProperties } from "react";
import { MobileActionBar, SiteFooter, SiteHeader } from "@/components/site/Chrome";
import { routing, type Locale } from "@/i18n/routing";
import { api } from "@/lib/api/client";
import { SITE_URL } from "@/lib/seo";
import "../globals.css";

// One variable font family for text and headings (fewer files on mobile networks).
// cyrillic-ext carries the Kazakh letters (ә ғ қ ң ө ұ ү һ і).
const inter = Inter({ subsets: ["latin", "cyrillic", "cyrillic-ext"], variable: "--font-inter" });

// No pages are built ahead of time: each is rendered on its first request and then cached
// (revalidated every 60 s via the API fetch). Builds therefore don't need a running API.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const site = await api.site(locale as Locale);
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: site.seo_title, template: `%s — ${site.business_name}` },
    description: site.seo_description,
    applicationName: site.business_name,
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const site = await api.site(locale);
  if (!site.enabled_locales.includes(locale)) notFound();
  const t = await getTranslations("Nav");
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${inter.variable} antialiased`}
      // Brand colour comes from business settings, no rebuild needed to change it.
      style={{ "--color-accent": site.accent_color } as CSSProperties}
    >
      <body className="flex min-h-dvh flex-col">
        {/* Only what client components need everywhere; pages add their own namespaces. */}
        <NextIntlClientProvider messages={{ Error: messages.Error }}>
          <a
            href="#content"
            className="sr-only z-50 bg-accent px-4 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
          >
            {t("skip")}
          </a>
          <SiteHeader site={site} />
          <main id="content" className="flex-1">
            {children}
          </main>
          <SiteFooter site={site} />
          <MobileActionBar site={site} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
