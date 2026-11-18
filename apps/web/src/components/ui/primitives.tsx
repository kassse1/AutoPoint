import type { ComponentProps, ReactNode } from "react";
import { Link } from "@/i18n/navigation";

const BUTTON = {
  primary: "bg-accent text-accent-fg shadow-[0_10px_30px_-12px_var(--color-accent)] hover:brightness-110",
  secondary: "border border-fg/20 bg-white/[0.02] text-fg backdrop-blur hover:border-fg/60",
  ghost: "text-fg hover:text-accent",
} as const;

export type ButtonVariant = keyof typeof BUTTON;

export function buttonClass(variant: ButtonVariant = "primary", extra = "") {
  return `inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-7 text-center text-xs font-semibold tracking-[0.14em] whitespace-nowrap uppercase transition ${BUTTON[variant]} ${extra}`;
}

/** Internal, locale-aware link styled as a button. */
export function ButtonLink({
  variant,
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link {...props} className={buttonClass(variant, className)} />;
}

/** External/protocol link (tel:, wa.me, t.me) styled as a button. */
export function ButtonAnchor({
  variant,
  className = "",
  ...props
}: ComponentProps<"a"> & { variant?: ButtonVariant }) {
  const external = props.href?.startsWith("http");
  return (
    <a
      {...props}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={buttonClass(variant, className)}
    />
  );
}

export function SectionHeader({
  eyebrow,
  title,
  lead,
  as: Heading = "h2",
  children,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  as?: "h1" | "h2";
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <Heading
          className={`mt-3 font-headline leading-[1.05] font-medium tracking-[0.03em] uppercase ${Heading === "h1" ? "text-4xl sm:text-5xl lg:text-6xl" : "text-3xl sm:text-5xl"}`}
        >
          {title}
        </Heading>
        {lead && <p className="mt-4 text-lg leading-relaxed text-fg-muted">{lead}</p>}
      </div>
      {children}
    </div>
  );
}

export function DemoBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-warning/40 px-2 py-0.5 text-[11px] font-medium tracking-wide text-warning">
      {label}
    </span>
  );
}

export function Section({ children, id, className = "" }: { children: ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={`py-20 sm:py-28 ${className}`}>
      <div className="container-page">{children}</div>
    </section>
  );
}
