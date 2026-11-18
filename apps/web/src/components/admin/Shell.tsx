"use client";

import {
  BarChart3,
  CalendarDays,
  Bell,
  Clock,
  History,
  Images,
  Inbox,
  MessageSquareQuote,
  LogOut,
  Percent,
  Settings,
  Shield,
  Users,
  UserSquare2,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/admin/auth";

const NAV = [
  { href: "/admin", key: "dashboard", icon: BarChart3, permission: "bookings.read" },
  { href: "/admin/bookings", key: "bookings", icon: CalendarDays, permission: "bookings.read" },
  { href: "/admin/customers", key: "customers", icon: Users, permission: "customers.read" },
  { href: "/admin/messages", key: "messages", icon: Inbox, permission: "customers.read" },
  { href: "/admin/services", key: "services", icon: Wrench, permission: "staff.read" },
  { href: "/admin/discounts", key: "discounts", icon: Percent, permission: "staff.read" },
  { href: "/admin/gallery", key: "gallery", icon: Images, permission: "media.write" },
  { href: "/admin/reviews", key: "reviews", icon: MessageSquareQuote, permission: "media.write" },
  { href: "/admin/staff", key: "staff", icon: UserSquare2, permission: "staff.read" },
  { href: "/admin/schedule", key: "schedule", icon: Clock, permission: "staff.read" },
  { href: "/admin/settings", key: "settings", icon: Settings, permission: "staff.read" },
  { href: "/admin/notifications", key: "notifications", icon: Bell, permission: "settings.write" },
  { href: "/admin/users", key: "users", icon: Shield, permission: "users.manage" },
  { href: "/admin/audit", key: "audit", icon: History, permission: "audit.read" },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const t = useTranslations("Admin");
  const { me, can, logout } = useAuth();
  const pathname = usePathname();
  const items = NAV.filter((item) => can(item.permission));
  const active = (href: string) => (href === "/admin" ? pathname === href : pathname.startsWith(href));

  return (
    <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top_right,rgb(195_164_108/0.06),transparent_50%)] lg:grid lg:grid-cols-[16rem_1fr]">
      <a href="#admin-main" className="sr-only z-50 bg-accent px-4 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        {t("skip")}
      </a>
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:h-dvh lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-4 px-5 py-4 lg:block">
          <Link href="/admin" className="flex items-center gap-3">
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-accent font-bold text-accent-fg shadow-[0_8px_24px_-8px_var(--color-accent)]">
              A
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-bold tracking-[0.18em] uppercase">AutoPoint</span>
              <span className="block text-[11px] tracking-[0.2em] text-accent uppercase">Admin</span>
            </span>
          </Link>
          <button type="button" onClick={logout} className="inline-flex min-h-10 items-center gap-2 text-sm text-fg-muted hover:text-fg lg:hidden">
            <LogOut className="size-4" aria-hidden="true" />
            {t("logout")}
          </button>
        </div>
        <nav aria-label={t("navigation")} className="overflow-x-auto px-3 pb-3 lg:pb-0">
          <ul className="flex gap-1 lg:flex-col">
            {items.map(({ href, key, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active(href) ? "page" : undefined}
                  className="group relative flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm whitespace-nowrap text-fg-muted transition-colors hover:bg-white/[0.04] hover:text-fg aria-[current=page]:bg-accent/10 aria-[current=page]:text-fg"
                >
                  <Icon className="size-4 shrink-0 group-aria-[current=page]:text-accent" strokeWidth={1.75} aria-hidden="true" />
                  {t(`nav.${key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden border-t border-line px-5 py-4 lg:absolute lg:inset-x-0 lg:bottom-0 lg:block">
          <p className="text-sm font-medium">{me.full_name}</p>
          <p className="text-xs text-fg-muted">{t(`roles.${me.role as "owner"}`)}</p>
          <button type="button" onClick={logout} className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm text-fg-muted hover:text-fg">
            <LogOut className="size-4" aria-hidden="true" />
            {t("logout")}
          </button>
        </div>
      </aside>
      <main id="admin-main" className="min-w-0 px-4 py-8 sm:px-8 lg:px-10">
        {children}
      </main>
    </div>
  );
}
