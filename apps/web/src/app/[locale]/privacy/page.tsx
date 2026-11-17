import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Section, SectionHeader } from "@/components/ui/primitives";
import type { Locale } from "@/i18n/routing";
import { api } from "@/lib/api/client";
import { pageMetadata } from "@/lib/seo";

const SECTIONS = ["1", "2", "3", "4", "5", "6"] as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const [t, site] = await Promise.all([getTranslations("Privacy"), api.site(locale)]);
  return pageMetadata({ locale, path: "/privacy", title: t("title"), description: t("lead"), siteName: site.business_name });
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const locale = (await params).locale as Locale;
  const [t, site] = await Promise.all([getTranslations("Privacy"), api.site(locale)]);
  return (
    <Section>
      <SectionHeader as="h1" title={t("title")} lead={t("lead")} />
      {site.is_demo && <p className="mt-6 max-w-3xl text-sm text-warning">{t("templateNotice")}</p>}
      <div className="mt-12 max-w-3xl space-y-10">
        {SECTIONS.map((s) => (
          <section key={s}>
            <h2 className="font-display text-xl font-semibold">{t(`sections.${s}.title`)}</h2>
            <p className="mt-3 leading-relaxed text-fg-muted">
              {t(`sections.${s}.text`, { business: site.business_name, email: site.email ?? site.phone })}
            </p>
          </section>
        ))}
      </div>
    </Section>
  );
}
