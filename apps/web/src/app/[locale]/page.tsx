import { getTranslations } from "next-intl/server";

// Phase 1 placeholder: proves routing, translations, fonts and tokens. Replaced in Phase 2.
export default async function HomePage() {
  const t = await getTranslations("Home");
  return (
    <main className="mx-auto flex min-h-dvh max-w-[1320px] flex-col justify-center px-4 sm:px-6">
      <p className="text-[13px] font-medium tracking-[0.12em] text-accent uppercase">
        {t("eyebrow")}
      </p>
      <h1 className="mt-4 max-w-3xl font-display text-4xl leading-tight font-semibold sm:text-6xl">
        {t("title")}
      </h1>
      <p className="mt-6 max-w-xl text-lg text-fg-muted">{t("lead")}</p>
      <div className="mt-10 h-px w-24 bg-line" />
      <p className="mt-6 text-sm text-fg-muted">{t("status")}</p>
    </main>
  );
}
