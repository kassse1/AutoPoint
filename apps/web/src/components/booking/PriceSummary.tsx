"use client";

import { useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { formatKzt } from "@/lib/format";

/** Price lines → subtotal → discount → total. Amounts always come from the API. */
export function PriceSummary({
  locale,
  lines,
  subtotal,
  discount,
  total,
}: {
  locale: Locale;
  lines: { name: string; detail?: string; price: number }[];
  subtotal: number;
  discount?: { name: string; amount_kzt: number } | null;
  total: number;
}) {
  const t = useTranslations("Booking.summary");
  return (
    <dl className="mt-4 space-y-3 text-sm tabular-nums">
      {lines.map((l) => (
        <div key={l.name} className="flex justify-between gap-4">
          <dt>
            {l.name}
            {l.detail && <span className="block text-xs text-fg-muted">{l.detail}</span>}
          </dt>
          <dd>{formatKzt(l.price, locale)}</dd>
        </div>
      ))}
      {discount && (
        <>
          <div className="flex justify-between gap-4 border-t border-line pt-3 text-fg-muted">
            <dt>{t("subtotal")}</dt>
            <dd>{formatKzt(subtotal, locale)}</dd>
          </div>
          <div className="flex justify-between gap-4 text-success">
            <dt>{t("discount", { name: discount.name })}</dt>
            <dd>−{formatKzt(discount.amount_kzt, locale)}</dd>
          </div>
        </>
      )}
      <div className="flex justify-between gap-4 border-t border-line pt-3 text-base font-semibold">
        <dt>{t("total")}</dt>
        <dd className="text-accent" aria-live="polite">
          {formatKzt(total, locale)}
        </dd>
      </div>
    </dl>
  );
}
