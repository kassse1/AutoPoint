"use client";

import { useState, type ReactNode } from "react";

/** Category tabs over server-rendered gallery items (filtering happens in the browser). */
export function GalleryFilter({
  categories,
  items,
  labels,
}: {
  categories: { slug: string; name: string }[];
  items: { id: number; category: string | null; node: ReactNode }[];
  labels: { all: string; filter: string };
}) {
  const [active, setActive] = useState<string | null>(null);
  const visible = active ? items.filter((i) => i.category === active) : items;
  const tabs = [{ slug: null, name: labels.all }, ...categories];
  return (
    <>
      <div role="group" aria-label={labels.filter} className="mt-10 flex flex-wrap gap-2 border-y border-line py-3">
        {tabs.map((c) => (
          <button
            key={c.slug ?? "all"}
            type="button"
            aria-pressed={active === c.slug}
            onClick={() => setActive(c.slug)}
            className="min-h-11 rounded-full border border-line px-4 text-sm text-fg-muted transition-colors hover:text-fg aria-pressed:border-accent aria-pressed:text-fg"
          >
            {c.name}
          </button>
        ))}
      </div>
      <ul className="mt-10 grid gap-10 lg:grid-cols-2">
        {visible.map((i) => (
          <li key={i.id}>{i.node}</li>
        ))}
      </ul>
    </>
  );
}
