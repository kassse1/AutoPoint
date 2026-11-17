import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import kk from "../../messages/kk.json";
import ru from "../../messages/ru.json";
import { routing, type Locale } from "./routing";

type Messages = { [key: string]: string | Messages };

function flatten(messages: Messages, prefix = ""): Record<string, string> {
  return Object.entries(messages).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? { ...acc, [path]: value } : { ...acc, ...flatten(value, path) };
  }, {});
}

const catalogs: Record<string, Messages> = { ru, kk, en };

describe("translation catalogs", () => {
  it("exist for every routed locale", () => {
    expect(Object.keys(catalogs).sort()).toEqual([...routing.locales].sort());
  });

  it.each(["kk", "en"])("%s has exactly the same keys as ru (default locale)", (locale) => {
    // The staff admin ("Admin") is Russian-only for now; every public text must exist in all three.
    const publicKeys = (m: Messages) => Object.keys(flatten(m)).filter((k) => !k.startsWith("Admin.")).sort();
    expect(publicKeys(catalogs[locale])).toEqual(publicKeys(ru));
  });

  it.each(Object.keys(catalogs))("%s has no empty strings", (locale) => {
    const empty = Object.entries(flatten(catalogs[locale])).filter(([, v]) => !v.trim());
    expect(empty).toEqual([]);
  });
});

describe("ICU messages", () => {
  const sample = {
    business: "AutoPoint", year: 2026, city: "Астана", service: "PPF", price: "1 ₸",
    from: 2, to: 3, value: 1.5, title: "x", rating: 5, address: "a", email: "e",
    current: 1, total: 7, name: "n", when: "w", reference: "AP-123456",
    page: 1, pages: 2, fields: "f", completed: 3, amount: "1 ₸", count: 2,
    link: (chunks: unknown) => chunks,
  };

  it.each(Object.keys(catalogs))("every %s message compiles and formats", (locale) => {
    const errors: string[] = [];
    const t = createTranslator({
      locale: locale as Locale,
      messages: catalogs[locale] as never,
      onError: (e) => errors.push(e.message),
    }) as unknown as { rich: (key: string, values: object) => unknown };
    // t.rich formats plain and rich (<link>…</link>) messages alike.
    for (const key of Object.keys(flatten(catalogs[locale]))) t.rich(key, sample);
    expect(errors).toEqual([]);
  });

  it("uses correct Russian plural forms for working days", () => {
    const t = createTranslator({ locale: "ru", messages: ru, namespace: "Common" });
    expect(t("durationDaysSingle", { value: 1 })).toBe("1 рабочий день");
    expect(t("durationDaysSingle", { value: 3 })).toBe("3 рабочих дня");
    expect(t("durationDaysSingle", { value: 5 })).toBe("5 рабочих дней");
    expect(t("durationDays", { from: 3, to: 5 })).toBe("3–5 рабочих дней");
    expect(t("durationHours", { from: 3.5, to: 5.5 })).toBe("3,5–5,5 ч");
  });
});
