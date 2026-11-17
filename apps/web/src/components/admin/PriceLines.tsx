"use client";

import { useTranslations } from "next-intl";
import { formatKzt } from "@/lib/format";

export function PriceLines({
  lines,
  discount,
  total,
  final,
}: {
  lines: { name: string; detail?: string; price: number }[];
  discount?: { name: string; amount: number } | null;
  total: number;
  final?: number | null;
}) {
  const t = useTranslations("Admin.price");
  return (
    <dl className="space-y-3 text-sm tabular-nums">
      {lines.map((l, i) => (
        <div key={i} className="flex justify-between gap-4">
          <dt>
            {l.name}
            {l.detail && <span className="block text-xs text-fg-muted">{l.detail}</span>}
          </dt>
          <dd>{formatKzt(l.price, "ru")}</dd>
        </div>
      ))}
      {discount && (
        <div className="flex justify-between gap-4 text-success">
          <dt>{t("discount", { name: discount.name })}</dt>
          <dd>−{formatKzt(discount.amount, "ru")}</dd>
        </div>
      )}
      <div className="flex justify-between gap-4 border-t border-line pt-3 font-semibold">
        <dt>{t("estimate")}</dt>
        <dd className="text-accent">{formatKzt(total, "ru")}</dd>
      </div>
      {final != null && (
        <div className="flex justify-between gap-4 font-semibold">
          <dt>{t("charged")}</dt>
          <dd>{formatKzt(final, "ru")}</dd>
        </div>
      )}
    </dl>
  );
}
