import { ArrowUpRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { ServiceCard as Card } from "@/lib/api/client";
import { durationParts, formatKzt } from "@/lib/format";
import { Media } from "@/components/ui/Media";

export async function PriceText({ service }: { service: Pick<Card, "price_from_kzt" | "price_display"> }) {
  const t = await getTranslations("Common");
  const locale = (await getLocale()) as Locale;
  if (service.price_from_kzt == null) return <>{t("priceOnRequest")}</>;
  const price = formatKzt(service.price_from_kzt, locale);
  return <>{service.price_display === "from" ? t("priceFrom", { price }) : price}</>;
}

export async function DurationText({ min, max }: { min: number | null; max: number | null }) {
  const t = await getTranslations("Common");
  if (min == null || max == null) return null;
  const d = durationParts(min, max);
  const key = d.unit === "days" ? "durationDays" : "durationHours";
  return <>{d.from === d.to ? t(`${key}Single`, { value: d.to }) : t(key, { from: d.from, to: d.to })}</>;
}

export async function ServiceCardView({ service, headingLevel = "h3" }: { service: Card; headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  return (
    <article className="group relative flex h-full flex-col border border-line bg-surface/40 transition-colors hover:border-fg/30">
      <Media src={service.image_url} alt={service.name} className="aspect-[4/3]" />
      <div className="flex flex-1 flex-col p-6">
        <Heading className="font-display text-xl font-semibold">
          <Link href={`/services/${service.slug}`} className="after:absolute after:inset-0">
            {service.name}
          </Link>
        </Heading>
        <p className="mt-3 flex-1 text-sm leading-relaxed text-fg-muted">{service.summary}</p>
        <div className="mt-6 flex items-end justify-between gap-4 border-t border-line pt-4 text-sm">
          <div>
            <p className="font-semibold text-accent tabular-nums">
              <PriceText service={service} />
            </p>
            <p className="mt-1 text-fg-muted">
              <DurationText min={service.duration_min} max={service.duration_max} />
            </p>
          </div>
          <ArrowUpRight
            className="size-5 text-fg-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </div>
      </div>
    </article>
  );
}
