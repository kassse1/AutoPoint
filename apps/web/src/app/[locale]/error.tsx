"use client";

import { useTranslations } from "next-intl";
import { buttonClass, Section } from "@/components/ui/primitives";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("Error");
  return (
    <Section>
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">{t("title")}</h1>
      <p className="mt-6 max-w-xl text-lg text-fg-muted">{t("lead")}</p>
      <button type="button" onClick={reset} className={buttonClass("primary", "mt-10")}>
        {t("retry")}
      </button>
    </Section>
  );
}
