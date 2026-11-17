import { getTranslations } from "next-intl/server";
import { ButtonLink, Section } from "@/components/ui/primitives";

export default async function NotFound() {
  const t = await getTranslations("NotFound");
  return (
    <Section>
      <p className="eyebrow">404</p>
      <h1 className="mt-4 font-display text-4xl font-semibold sm:text-6xl">{t("title")}</h1>
      <p className="mt-6 max-w-xl text-lg text-fg-muted">{t("lead")}</p>
      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/">{t("home")}</ButtonLink>
        <ButtonLink href="/services" variant="secondary">
          {t("services")}
        </ButtonLink>
      </div>
    </Section>
  );
}
