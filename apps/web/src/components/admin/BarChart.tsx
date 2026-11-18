"use client";

import { useState } from "react";

export type BarDatum = { label: string; short: string; value: number; detail?: string };

const W = 720;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 28, left: 36 };

function niceMax(max: number): number {
  if (max <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / step) * step;
}

/** Single-series bar chart: no legend (the title names the series), recessive grid,
 * per-bar tooltip with a full-height hover target, and a table view for screen readers. */
export function BarChart({
  title,
  data,
  tableLabel,
  valueLabel,
}: {
  title: string;
  data: BarDatum[];
  tableLabel: string;
  valueLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(1, data.length);
  const barW = Math.max(2, slot - 2); // 2px surface gap between bars
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(data.length / 8);

  return (
    <figure>
      <figcaption className="mb-3 text-sm font-medium">{title}</figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={title}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--color-line)" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--color-fg-muted)">
                {tick}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = PAD.left + i * slot + 1;
            const top = y(d.value);
            const h = PAD.top + plotH - top;
            const r = Math.min(4, barW / 2, h);
            return (
              <g key={d.label}>
                {d.value > 0 && (
                  // Rounded data end (top), square at the baseline.
                  <path
                    d={`M${x},${top + h}V${top + r}Q${x},${top} ${x + r},${top}H${x + barW - r}Q${x + barW},${top} ${x + barW},${top + r}V${top + h}Z`}
                    fill="var(--color-accent)"
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                )}
                {i % labelEvery === 0 && (
                  <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--color-fg-muted)">
                    {d.short}
                  </text>
                )}
                {/* Hit target: the whole column, larger than the bar itself. */}
                <rect
                  x={PAD.left + i * slot}
                  y={PAD.top}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`${d.label}: ${d.value}`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="outline-none"
                />
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs shadow-lg"
            style={{ left: `clamp(0px, ${((PAD.left + hover * slot) / W) * 100}% - 3rem, calc(100% - 9rem))` }}
          >
            <p className="text-fg-muted">{data[hover].label}</p>
            <p className="font-semibold tabular-nums">
              {valueLabel}: {data[hover].value}
            </p>
            {data[hover].detail && <p className="text-fg-muted tabular-nums">{data[hover].detail}</p>}
          </div>
        )}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-fg-muted hover:text-fg">{tableLabel}</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <tbody className="divide-y divide-line">
            {data.map((d) => (
              <tr key={d.label}>
                <th scope="row" className="py-1 font-normal text-fg-muted">
                  {d.label}
                </th>
                <td className="py-1 text-right">{d.value}</td>
                <td className="py-1 text-right text-fg-muted">{d.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
