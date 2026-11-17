import { useId } from "react";

type Variant = "neutral" | "before" | "after";

const BODY =
  "M60 228C52 222 50 205 58 196L86 186C140 176 200 170 250 166C290 148 330 120 380 112C440 104 520 104 570 116C610 126 650 146 690 156C725 162 742 172 744 190L746 214C746 224 740 230 730 230L668 230A56 56 0 0 0 556 230L290 230A56 56 0 0 0 178 230L70 230C64 230 60 229 60 228Z";

/**
 * Line-art stand-in used until real photos are uploaded. `before` adds a dull, dusty
 * finish; `after` adds a clean highlight, so before/after sliders still read correctly.
 */
export function CarArt({ variant = "neutral", className }: { variant?: Variant; className?: string }) {
  const id = useId().replace(/:/g, "");
  const stroke = variant === "before" ? "var(--color-fg-muted)" : "var(--color-fg)";
  return (
    <svg
      viewBox="0 0 800 320"
      className={className}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <radialGradient id={`${id}-light`} cx="50%" cy="38%" r="60%">
          <stop offset="0" stopColor="var(--color-accent)" stopOpacity={variant === "before" ? 0.03 : 0.12} />
          <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-shine`} x1="0" x2="1">
          <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--color-accent)" stopOpacity="1" />
          <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-body`}>
          <path d={BODY} />
        </clipPath>
        <filter id={`${id}-dust`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
          <feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.52  0 0 0 0 0.48  0 0 0 0.55 0" />
        </filter>
      </defs>

      <rect width="800" height="320" fill={`url(#${id}-light)`} />
      <ellipse cx="400" cy="272" rx="340" ry="9" fill="#000" opacity="0.6" />
      <line x1="24" y1="274" x2="776" y2="274" stroke="var(--color-line)" />

      <path d={BODY} fill="var(--color-surface)" fillOpacity={variant === "after" ? 0.9 : 0.6} />
      {variant === "before" && (
        <g clipPath={`url(#${id}-body)`}>
          <rect width="800" height="320" filter={`url(#${id}-dust)`} opacity="0.5" />
          <path
            d="M340 150q40-10 80 2M520 140q30 4 52 16M150 196q50-8 92-6M400 190q60-6 120 2M610 176q30 0 56 8"
            stroke="var(--color-fg-muted)"
            strokeWidth="0.8"
            fill="none"
            opacity="0.7"
          />
        </g>
      )}

      <g fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
        <path d={BODY} />
        <path d="M300 160C330 136 360 122 392 118L470 114V160Z" />
        <path d="M482 114L560 120C590 128 615 142 630 158L482 160Z" />
        <path d="M476 166L472 226" opacity="0.5" />
        <path d="M66 198L104 190M730 176L744 181" />
        {[234, 612].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="230" r="44" />
            <circle cx={cx} cy="230" r="28" opacity="0.6" />
            <circle cx={cx} cy="230" r="5" />
          </g>
        ))}
      </g>

      {variant !== "before" && (
        <path
          d="M110 188C300 174 520 170 716 176"
          fill="none"
          stroke={`url(#${id}-shine)`}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
