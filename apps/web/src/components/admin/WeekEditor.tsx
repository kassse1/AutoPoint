"use client";

import { useTranslations } from "next-intl";
import type { Interval } from "@/lib/admin/api";
import { Btn, inputCls } from "./ui";

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const hhmm = (t: string) => t.slice(0, 5);

/** Weekly intervals editor: each day may have several intervals (e.g. a lunch break). */
export function WeekEditor({
  value,
  onChange,
  disabled,
  singlePerDay = false,
}: {
  value: Interval[];
  onChange: (value: Interval[]) => void;
  disabled?: boolean;
  singlePerDay?: boolean;
}) {
  const t = useTranslations("Admin.week");
  const set = (index: number, patch: Partial<Interval>) =>
    onChange(value.map((iv, i) => (i === index ? { ...iv, ...patch } : iv)));

  return (
    <div className="divide-y divide-line">
      {DAYS.map((day) => {
        const rows = value.map((iv, index) => ({ iv, index })).filter(({ iv }) => iv.weekday === day);
        return (
          <div key={day} className="flex flex-wrap items-center gap-3 py-2">
            <span className="w-28 text-sm">{t(`days.${day}`)}</span>
            {rows.length === 0 && <span className="text-sm text-fg-muted">{t("closed")}</span>}
            {rows.map(({ iv, index }) => (
              <span key={index} className="flex items-center gap-1">
                <input type="time" step={900} disabled={disabled} aria-label={`${t(`days.${day}`)}: ${t("from")}`} value={hhmm(iv.starts)}
                  onChange={(e) => set(index, { starts: e.target.value })} className={`${inputCls} w-28`} />
                <span aria-hidden="true">–</span>
                <input type="time" step={900} disabled={disabled} aria-label={`${t(`days.${day}`)}: ${t("to")}`} value={hhmm(iv.ends)}
                  onChange={(e) => set(index, { ends: e.target.value })} className={`${inputCls} w-28`} />
                <button type="button" disabled={disabled} onClick={() => onChange(value.filter((_, i) => i !== index))}
                  aria-label={t("remove")} className="min-h-10 px-2 text-fg-muted hover:text-danger">×</button>
              </span>
            ))}
            {!disabled && !(singlePerDay && rows.length) && (
              <Btn onClick={() => onChange([...value, { weekday: day, starts: "09:00", ends: "18:00" }])}>{t("add")}</Btn>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** API returns "09:00:00"; send "HH:MM". */
export const normalizeWeek = (value: Interval[]) =>
  value.map((iv) => ({ weekday: iv.weekday, starts: hhmm(iv.starts), ends: hhmm(iv.ends) }));
