import type { Locale } from "@/i18n/routing";

const INTL_LOCALE: Record<Locale, string> = { ru: "ru-RU", kk: "kk-KZ", en: "en-US" };

/** Integer KZT → "45 000 ₸" (ru/kk) or "₸45,000" (en). */
export function formatKzt(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: "currency",
    currency: "KZT",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Working time for display. Short jobs in hours (rounded to 0.5 h); jobs of 10 h or more
 * in working days of 8 h, because that's how customers plan leaving the car.
 */
export function durationParts(minMinutes: number, maxMinutes: number) {
  if (maxMinutes >= 600) {
    return { unit: "days" as const, from: Math.ceil(minMinutes / 480), to: Math.ceil(maxMinutes / 480) };
  }
  const hours = (m: number) => Math.max(0.5, Math.round(m / 30) / 2);
  return { unit: "hours" as const, from: hours(minMinutes), to: hours(maxMinutes) };
}

export function phoneDisplay(e164: string): string {
  // +7XXXXXXXXXX → +7 XXX XXX XX XX (Kazakhstan); other numbers are shown as stored.
  const m = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  return m ? `+7 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164;
}

export const telHref = (e164: string) => `tel:${e164}`;
export const whatsappHref = (e164: string, text?: string) =>
  `https://wa.me/${e164.replace(/\D/g, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
export const telegramHref = (username: string) => `https://t.me/${username}`;
