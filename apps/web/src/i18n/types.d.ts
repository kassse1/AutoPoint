import type messages from "../../messages/ru.json";
import type { routing } from "./routing";

// Typed translation keys: `tsc` fails on any key that doesn't exist in ru.json.
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
