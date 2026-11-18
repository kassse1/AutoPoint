"use client";

import { ChevronsLeftRight } from "lucide-react";
import { useState, type ReactNode } from "react";

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
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line select-none">
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
        onChange={(e) => setPosition(Number(e.target.value))}
        aria-label={sliderLabel}
        aria-valuetext={`${position}%`}
        className="peer absolute inset-0 z-10 h-full w-full cursor-ew-resize opacity-0"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-px bg-fg/80 peer-focus-visible:bg-accent"
        style={{ left: `${position}%` }}
      >
        <span className="absolute top-1/2 left-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-fg/50 bg-bg/80 text-fg">
          <ChevronsLeftRight className="size-5" strokeWidth={1.5} />
        </span>
      </div>
      <span className="pointer-events-none absolute top-3 left-3 bg-bg/70 px-2 py-1 text-[11px] tracking-[0.12em] uppercase">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute top-3 right-3 bg-bg/70 px-2 py-1 text-[11px] tracking-[0.12em] uppercase">
        {afterLabel}
      </span>
    </div>
  );
}
