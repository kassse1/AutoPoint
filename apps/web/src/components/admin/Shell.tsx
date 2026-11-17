"use client";

import {
  BarChart3,
  CalendarDays,
  Clock,
  History,
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
  { href: "/admin/services", key: "services", icon: Wrench, permission: "staff.read" },
  { href: "/admin/discounts", key: "discounts", icon: Percent, permission: "staff.read" },
  { href: "/admin/staff", key: "staff", icon: UserSquare2, permission: "staff.read" },
  { href: "/admin/schedule", key: "schedule", icon: Clock, permission: "staff.read" },
  { href: "/admin/settings", key: "settings", icon: Settings, permission: "staff.read" },
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
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <a href="#admin-main" className="sr-only z-50 bg-accent px-4 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        {t("skip")}
      </a>
      <aside className="border-b border-line bg-surface/40 lg:sticky lg:top-0 lg:h-dvh lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-4 px-5 py-4 lg:block">
          <Link href="/admin" className="font-display text-base font-bold tracking-[0.14em] uppercase">
            AutoPoint <span className="text-accent">Admin</span>
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
                  className="flex min-h-10 items-center gap-3 rounded-sm px-3 text-sm whitespace-nowrap text-fg-muted transition-colors hover:bg-surface hover:text-fg aria-[current=page]:bg-surface aria-[current=page]:text-fg"
                >
                  <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
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
      <main id="admin-main" className="min-w-0 px-4 py-8 sm:px-8">
        {children}
      </main>
    </div>
  );
}
