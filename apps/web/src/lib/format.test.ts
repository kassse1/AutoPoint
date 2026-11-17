import { describe, expect, it } from "vitest";
import { durationParts, formatKzt, phoneDisplay, whatsappHref } from "./format";

// Intl inserts narrow no-break spaces; normalise them for readable assertions.
const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("formatKzt", () => {
  it("formats integer tenge per locale", () => {
    expect(plain(formatKzt(153000, "ru"))).toBe("153 000 ₸");
    expect(plain(formatKzt(153000, "kk"))).toBe("153 000 ₸");
    expect(plain(formatKzt(153000, "en"))).toBe("₸153,000");
  });
  it("never shows fractions", () => {
    expect(plain(formatKzt(999, "ru"))).toBe("999 ₸");
  });
});

describe("durationParts", () => {
  it("uses half-hour steps for short jobs", () => {
    expect(durationParts(210, 330)).toEqual({ unit: "hours", from: 3.5, to: 5.5 });
    expect(durationParts(10, 20)).toEqual({ unit: "hours", from: 0.5, to: 0.5 });
  });
  it("switches to 8-hour working days for long jobs", () => {
    expect(durationParts(435, 645)).toEqual({ unit: "days", from: 1, to: 2 });
    expect(durationParts(1305, 1945)).toEqual({ unit: "days", from: 3, to: 5 });
  });
});

describe("contact helpers", () => {
  it("formats Kazakhstan numbers and leaves others as stored", () => {
    expect(phoneDisplay("+77001234567")).toBe("+7 700 123 45 67");
    expect(phoneDisplay("+4915112345678")).toBe("+4915112345678");
  });
  it("builds wa.me links with an encoded prefilled message", () => {
    expect(whatsappHref("+77001234567", "Привет & да")).toBe(
      "https://wa.me/77001234567?text=%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82%20%26%20%D0%B4%D0%B0",
    );
  });
});
