import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CtaBand, GalleryFigure } from "@/components/site/Blocks";
import { Media } from "@/components/ui/Media";
import { DemoBadge, Section, SectionHeader } from "@/components/ui/primitives";
import type { Locale } from "@/i18n/routing";
import { api } from "@/lib/api/client";
import { pageMetadata } from "@/lib/seo";

const STANDARDS = ["1", "2", "3", "4"] as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/about">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const [t, site] = await Promise.all([getTranslations("About"), api.site(locale)]);
  return pageMetadata({
    locale,
    path: "/about",
    title: t("metaTitle"),
    description: t("metaDescription"),
    siteName: site.business_name,
  });
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export default async function AboutPage({ params }: PageProps<"/[locale]/about">) {
  const locale = (await params).locale as Locale;
  const [t, tc, site, team, studio] = await Promise.all([
    getTranslations("About"),
    getTranslations("Common"),
    api.site(locale),
    api.team(locale),
    api.gallery(locale, { kind: "studio" }),
  ]);

  return (
    <>
      <Section>
        <SectionHeader as="h1" eyebrow={t("eyebrow")} title={t("title", { business: site.business_name })} lead={t("lead")} />
        <div className="mt-14 grid gap-12 lg:grid-cols-12">
          <Media src={null} alt={t("imageAlt")} variant="after" className="aspect-[4/3] lg:col-span-7" />
          <div className="space-y-6 text-lg leading-relaxed text-fg-muted lg:col-span-5">
            <p>{t("story.p1")}</p>
            <p>{t("story.p2")}</p>
          </div>
        </div>
      </Section>

      <Section className="border-t border-line">
        <SectionHeader eyebrow={t("standards.eyebrow")} title={t("standards.title")} />
        <ul className="mt-12 grid gap-10 sm:grid-cols-2">
          {STANDARDS.map((s, i) => (
            <li key={s} className="flex gap-6 border-t border-line pt-6">
              <span className="font-display text-sm text-accent tabular-nums">0{i + 1}</span>
              <div>
                <h3 className="font-display text-lg font-semibold">{t(`standards.items.${s}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{t(`standards.items.${s}.text`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {team.length > 0 && (
        <Section className="border-t border-line">
          <SectionHeader eyebrow={t("team.eyebrow")} title={t("team.title")} />
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {team.map((m) => (
              <li key={m.id} className="border border-line bg-surface/40 p-8">
                <div className="flex items-start justify-between gap-4">
                  {m.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small avatar, any origin
                    <img src={m.photo_url} alt="" className="size-16 rounded-full object-cover" />
                  ) : (
                    <span aria-hidden="true" className="grid size-16 place-items-center rounded-full border border-line font-display text-lg text-accent">
                      {initials(m.display_name)}
                    </span>
                  )}
                  {m.is_demo && <DemoBadge label={tc("demoProfile")} />}
                </div>
                <h3 className="mt-6 font-display text-lg font-semibold">{m.display_name}</h3>
                <p className="text-sm text-accent">{m.position}</p>
                {m.bio && <p className="mt-4 text-sm leading-relaxed text-fg-muted">{m.bio}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {studio.length > 0 && (
        <Section className="border-t border-line">
          <SectionHeader title={t("studio")} />
          <div className="mt-12 grid gap-10 lg:grid-cols-2">
            {studio.map((item) => (
              <GalleryFigure key={item.id} item={item} />
            ))}
          </div>
        </Section>
      )}

      <CtaBand />
    </>
  );
}
