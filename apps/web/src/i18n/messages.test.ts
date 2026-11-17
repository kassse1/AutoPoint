import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import kk from "../../messages/kk.json";
import ru from "../../messages/ru.json";
import { routing } from "./routing";

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
    expect(Object.keys(flatten(catalogs[locale])).sort()).toEqual(Object.keys(flatten(ru)).sort());
  });

  it.each(Object.keys(catalogs))("%s has no empty strings", (locale) => {
    const empty = Object.entries(flatten(catalogs[locale])).filter(([, v]) => !v.trim());
    expect(empty).toEqual([]);
  });
});
