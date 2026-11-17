import { describe, expect, it } from "vitest";
import { buildIcs, contactsSchema, formatDay, normalizePhone } from "./booking";

describe("normalizePhone (mirrors the API rule)", () => {
  it.each([
    ["8 (701) 555-12-34", "+77015551234"],
    ["+7 701 555 12 34", "+77015551234"],
    ["77015551234", "+77015551234"],
    ["+49 151 1234 5678", "+4915112345678"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each(["123", "", "+7 701", "phone", "8701555123"])("rejects %s", (raw) => {
    expect(normalizePhone(raw)).toBeNull();
  });
});

describe("contactsSchema", () => {
  const valid = {
    name: "Айдос",
    phone: "8 701 555 12 34",
    email: "",
    vehicleNote: "",
    comment: "",
    consent: true as const,
    website: "",
  };

  it("accepts a minimal valid form", () => {
    expect(contactsSchema.safeParse(valid).success).toBe(true);
  });

  it("returns translation keys as error messages", () => {
    const result = contactsSchema.safeParse({ ...valid, name: "A", phone: "1", email: "x@", consent: false });
    expect(result.success).toBe(false);
    const messages = Object.fromEntries(
      (result.error?.issues ?? []).map((i) => [String(i.path[0]), i.message]),
    );
    expect(messages).toEqual({
      name: "nameTooShort",
      phone: "phoneInvalid",
      email: "emailInvalid",
      consent: "consentRequired",
    });
  });
});

describe("buildIcs", () => {
  it("writes UTC times and escapes text", () => {
    const ics = buildIcs({
      uid: "AP-T648CV@autopoint",
      title: "AutoPoint: Керамика, фары",
      start: "2026-11-19T10:00:00+05:00",
      end: "2026-11-20T14:30:00+05:00",
      location: "Астана; демо",
      description: "Номер: AP-T648CV",
      now: new Date("2026-11-17T09:00:00Z"),
    });
    expect(ics).toContain("DTSTART:20261119T050000Z");
    expect(ics).toContain("DTEND:20261120T093000Z");
    expect(ics).toContain("SUMMARY:AutoPoint: Керамика\\, фары");
    expect(ics).toContain("LOCATION:Астана\\; демо");
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
  });
});

describe("formatDay", () => {
  it("formats a calendar date regardless of the browser's timezone", () => {
    expect(formatDay("2026-11-19", "ru", { weekday: "long", day: "numeric", month: "long" })).toBe(
      "четверг, 19 ноября",
    );
    expect(formatDay("2026-11-19", "en", { weekday: "short", day: "numeric" })).toBe("19 Thu");
  });
});
