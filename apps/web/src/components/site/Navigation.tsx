"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, usePathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { buttonClass } from "@/components/ui/primitives";
import { LanguageSwitcher } from "./LanguageSwitcher";

export type NavItem = { href: string; label: string };

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function MainNav({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="hidden lg:block">
      <ul className="flex items-center gap-8 text-sm">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`transition-colors ${active ? "text-fg" : "text-fg-muted hover:text-fg"}`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function MobileMenu({
  items,
  locales,
  labels,
}: {
  items: NavItem[];
  locales: Locale[];
  labels: { open: string; close: string; nav: string; language: string; book: string };
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Close when the route changes (a link inside the menu was followed).
  const [openedOn, setOpenedOn] = useState(pathname);
  if (open && openedOn !== pathname) setOpen(false);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? labels.close : labels.open}
        onClick={() => {
          setOpenedOn(pathname);
          setOpen((v) => !v);
        }}
        className="relative z-50 grid size-11 place-items-center text-fg"
      >
        {open ? <X className="size-6" strokeWidth={1.5} /> : <Menu className="size-6" strokeWidth={1.5} />}
      </button>
      {/* Portal: the header's backdrop-filter would otherwise trap this fixed panel inside it. */}
      {open && createPortal(
        <div
          ref={panel}
          id="mobile-menu"
          // Above the bottom action bar (z-30), below the header (z-40) that holds the close button.
          className="fixed inset-0 z-[35] flex flex-col bg-bg px-4 pt-24 pb-10 sm:px-6"
        >
          <nav aria-label={labels.nav}>
            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(pathname, item.href) ? "page" : undefined}
                    className="block py-3 font-display text-3xl font-semibold aria-[current=page]:text-accent"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-auto flex flex-col gap-6">
            <LanguageSwitcher locales={locales} label={labels.language} />
            <Link href="/booking" className={buttonClass("primary", "w-full")}>
              {labels.book}
            </Link>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
