import { MessageCircle, Phone } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { Site } from "@/lib/api/client";
import { phoneDisplay, telegramHref, telHref, whatsappHref } from "@/lib/format";
import { ButtonLink } from "@/components/ui/primitives";
import { MainNav, MobileMenu, type NavItem } from "./Navigation";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { OpeningHoursList } from "./OpeningHours";

async function navItems(): Promise<NavItem[]> {
  const t = await getTranslations("Nav");
  return [
    { href: "/services", label: t("services") },
    { href: "/gallery", label: t("gallery") },
    { href: "/about", label: t("about") },
    { href: "/contacts", label: t("contacts") },
  ];
}

function Wordmark({ site }: { site: Site }) {
  return (
    <Link href="/" className="font-display text-lg font-bold tracking-[0.14em] uppercase">
      {site.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo may be SVG from settings
        <img src={site.logo_url} alt={site.business_name} className="h-8 w-auto" />
      ) : (
        site.business_name
      )}
    </Link>
  );
}

export async function SiteHeader({ site }: { site: Site }) {
  const t = await getTranslations("Nav");
  const items = await navItems();
  const locales = site.enabled_locales as Locale[];
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-6">
        <Wordmark site={site} />
        <MainNav items={items} label={t("main")} />
        <div className="flex items-center gap-3 sm:gap-5">
          <div className="hidden sm:block">
            <LanguageSwitcher locales={locales} label={t("language")} />
          </div>
          <a
            href={telHref(site.phone)}
            className="hidden text-sm text-fg-muted tabular-nums transition-colors hover:text-fg xl:inline"
          >
            {phoneDisplay(site.phone)}
          </a>
          <div className="hidden sm:block">
            <ButtonLink href="/booking" className="min-h-10 px-5">
              {t("book")}
            </ButtonLink>
          </div>
          <MobileMenu
            items={[{ href: "/", label: t("home") }, ...items]}
            locales={locales}
            labels={{
              open: t("openMenu"),
              close: t("closeMenu"),
              nav: t("main"),
              language: t("language"),
              book: t("book"),
            }}
          />
        </div>
      </div>
    </header>
  );
}

export async function SiteFooter({ site }: { site: Site }) {
  const t = await getTranslations("Footer");
  const tc = await getTranslations("Common");
  const items = await navItems();
  return (
    <footer className="border-t border-line pb-24 lg:pb-0">
      <div className="container-page grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <Wordmark site={site} />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-fg-muted">{t("tagline")}</p>
        </div>
        <nav aria-label={t("navigation")}>
          <h2 className="eyebrow">{t("navigation")}</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {[...items, { href: "/booking", label: tc("book") }, { href: "/privacy", label: t("privacy") }].map(
              (item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-fg-muted transition-colors hover:text-fg">
                    {item.label}
                  </Link>
                </li>
              ),
            )}
          </ul>
        </nav>
        <div>
          <h2 className="eyebrow">{t("contacts")}</h2>
          <address className="mt-4 space-y-2 text-sm not-italic">
            <p className="text-fg-muted">{site.address}</p>
            <p>
              <a href={telHref(site.phone)} className="tabular-nums hover:text-accent">
                {phoneDisplay(site.phone)}
              </a>
            </p>
            {site.whatsapp && (
              <p>
                <a href={whatsappHref(site.whatsapp)} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                  WhatsApp
                </a>
              </p>
            )}
            {site.telegram && (
              <p>
                <a href={telegramHref(site.telegram)} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                  Telegram
                </a>
              </p>
            )}
            {site.email && (
              <p>
                <a href={`mailto:${site.email}`} className="hover:text-accent">
                  {site.email}
                </a>
              </p>
            )}
          </address>
        </div>
        <div>
          <h2 className="eyebrow">{t("hours")}</h2>
          <OpeningHoursList hours={site.hours} className="mt-4 text-sm" />
        </div>
      </div>
      <div className="container-page flex flex-col gap-3 border-t border-line py-6 text-xs text-fg-muted sm:flex-row sm:justify-between">
        <p>{t("copyright", { year: new Date().getFullYear(), business: site.business_name })}</p>
        {site.is_demo && <p className="text-warning">{t("demoNotice")}</p>}
      </div>
    </footer>
  );
}

/** Sticky contact bar on small screens: call · WhatsApp · book. */
export async function MobileActionBar({ site }: { site: Site }) {
  const t = await getTranslations("Common");
  const locale = (await getLocale()) as Locale;
  const cell = "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] tracking-wide";
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-bg/95 backdrop-blur lg:hidden">
      <a href={telHref(site.phone)} className={cell}>
        <Phone className="size-5" strokeWidth={1.5} aria-hidden="true" />
        {t("call")}
      </a>
      {site.whatsapp && (
        <a
          href={whatsappHref(site.whatsapp, t("whatsappText", { business: site.business_name }))}
          target="_blank"
          rel="noopener noreferrer"
          className={`${cell} border-l border-line`}
          lang={locale}
        >
          <MessageCircle className="size-5" strokeWidth={1.5} aria-hidden="true" />
          WhatsApp
        </a>
      )}
      <Link href="/booking" className={`${cell} bg-accent font-semibold text-accent-fg`}>
        {t("book")}
      </Link>
    </div>
  );
}
