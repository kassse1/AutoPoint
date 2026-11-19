"use client";

import { ChevronsLeftRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Comparison slider driven by a native range input (keyboard, touch and screen readers). */
export function BeforeAfter({
  before,
  after,
  beforeLabel,
  afterLabel,
  sliderLabel,
}: {
  before: ReactNode;
  after: ReactNode;
  beforeLabel: string;
  afterLabel: string;
  sliderLabel: string;
}) {
  const [position, setPosition] = useState(50);
  const root = useRef<HTMLDivElement>(null);
  const touched = useRef(false);

  // Once it scrolls into view, sweep the handle left and right so visitors see it is draggable.
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const step = (now: number) => {
          if (touched.current) return;
          const p = Math.min((now - start) / 1800, 1);
          setPosition(Math.round(50 + Math.sin(p * Math.PI * 2) * 22 * (1 - p)));
          if (p < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={root} className="relative overflow-hidden select-none">
      <div>{after}</div>
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        data-testid="before-layer"
      >
        {before}
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={position}
        onPointerDown={() => (touched.current = true)}
        onKeyDown={() => (touched.current = true)}
        onChange={(e) => setPosition(Number(e.target.value))}
        aria-label={sliderLabel}
        aria-valuetext={`${position}%`}
        className="peer absolute inset-0 z-10 h-full w-full cursor-ew-resize opacity-0"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-accent peer-focus-visible:bg-fg shadow-[0_0_18px_var(--color-accent)]"
        style={{ left: `${position}%` }}
      >
        <span className="absolute top-1/2 left-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-accent text-accent-fg shadow-[0_0_0_6px_rgb(0_0_0/0.35),0_0_30px_var(--color-accent)]">
          <ChevronsLeftRight className="size-5" strokeWidth={2} />
        </span>
      </div>
      <span className="pointer-events-none absolute top-4 left-4 rounded-full bg-black/55 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-fg/80 uppercase backdrop-blur">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute top-4 right-4 rounded-full bg-black/55 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-accent uppercase backdrop-blur">
        {afterLabel}
      </span>
    </div>
  );
}
