import { z } from "zod";
import type { components } from "./api/schema";

export type Quote = components["schemas"]["QuoteOut"];
export type Availability = components["schemas"]["AvailabilityOut"];
export type BookingView = components["schemas"]["BookingOut"];
export type BookingCreated = components["schemas"]["BookingCreated"];

/** Same rule as the API: "8 (701) 123-45-67" / "+7 701 …" → "+77011234567", or null. */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/[\s\-().]/g, "");
  if (/^8\d{10}$/.test(digits)) digits = `+7${digits.slice(1)}`;
  else if (/^7\d{10}$/.test(digits)) digits = `+${digits}`;
  return /^\+[1-9]\d{9,14}$/.test(digits) ? digits : null;
}

/** Messages are translation keys under Booking.validation. */
export const contactsSchema = z.object({
  name: z.string().trim().min(2, "nameTooShort").max(100, "tooLong"),
  phone: z.string().trim().refine((v) => normalizePhone(v) !== null, "phoneInvalid"),
  email: z
    .string()
    .trim()
    .max(200, "tooLong")
    .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "emailInvalid"),
  vehicleNote: z.string().trim().max(200, "tooLong"),
  comment: z.string().trim().max(1000, "tooLong"),
  consent: z.literal(true, { error: "consentRequired" }),
  website: z.string(), // honeypot
});
export type ContactsForm = z.infer<typeof contactsSchema>;

export type ApiError = { status: number; code: string };

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1/public${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch {
    throw { status: 0, code: "NETWORK" } satisfies ApiError;
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, code: data?.code ?? "UNKNOWN" } satisfies ApiError;
  return data as T;
}

const ics = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escapeIcs = (s: string) => s.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");

/** A one-event iCalendar file. Times are written in UTC, so no timezone data is needed. */
export function buildIcs(opts: {
  uid: string;
  title: string;
  start: string;
  end: string;
  location: string;
  description: string;
  now?: Date;
}): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AutoPoint//Booking//EN",
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    `DTSTAMP:${ics(opts.now ?? new Date())}`,
    `DTSTART:${ics(new Date(opts.start))}`,
    `DTEND:${ics(new Date(opts.end))}`,
    `SUMMARY:${escapeIcs(opts.title)}`,
    `LOCATION:${escapeIcs(opts.location)}`,
    `DESCRIPTION:${escapeIcs(opts.description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

/** "2026-11-24" → localized day label, independent of the browser's timezone data. */
export function formatDay(isoDate: string, locale: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(
    new Date(`${isoDate}T12:00:00Z`),
  );
}
