import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";
import { routing } from "./routing";

// Reading the locale from root params (not request headers) keeps pages statically renderable.
export default getRequestConfig(async () => {
  const param = await rootLocale();
  const locale = hasLocale(routing.locales, param) ? param : routing.defaultLocale;
  return {
    locale,
    // shortcut: fixed business timezone; moves to business settings from the API in Phase 2.
    timeZone: "Asia/Almaty",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
