import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ru", "kk", "en"],
  defaultLocale: "ru",
  // `/` is Russian, `/kk/...` and `/en/...` are prefixed.
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
