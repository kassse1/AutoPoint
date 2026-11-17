import { getLocale, getTranslations } from "next-intl/server";
import type { Site } from "@/lib/api/client";

// 2024-01-01 was a Monday; used only to get localized weekday names from Intl.
const weekdayName = (weekday: number, locale: string) =>
  new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2024, 0, weekday)),
  );

export async function OpeningHoursList({ hours, className = "" }: { hours: Site["hours"]; className?: string }) {
  const locale = await getLocale();
  const t = await getTranslations("Common");
  const byDay = new Map(hours.map((h) => [h.weekday, h]));
  return (
    <dl className={`grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 ${className}`}>
      {[1, 2, 3, 4, 5, 6, 7].map((d) => {
        const h = byDay.get(d);
        return (
          <div key={d} className="contents">
            <dt className="text-fg-muted first-letter:uppercase">{weekdayName(d, locale)}</dt>
            <dd className="text-right tabular-nums">{h ? `${h.opens}–${h.closes}` : t("closed")}</dd>
          </div>
        );
      })}
    </dl>
  );
}
