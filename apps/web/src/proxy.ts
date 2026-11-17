import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Skip API, admin (own routing from Phase 5), Next internals and files with an extension.
  matcher: "/((?!api|admin|_next|_vercel|.*\\..*).*)",
};
