"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { buttonClass, type ButtonVariant } from "@/components/ui/primitives";
import { ApiError } from "@/lib/admin/api";

export const inputCls =
  "min-h-10 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm transition-colors focus:border-accent/60 aria-invalid:border-danger disabled:opacity-50";

export function Btn({
  variant = "secondary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant | "danger" }) {
  const look =
    variant === "danger"
      ? buttonClass("secondary", "border-danger/60 text-danger hover:border-danger")
      : buttonClass(variant);
  return (
    <button
      type="button"
      {...props}
      className={`${look} min-h-10 px-4 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    />
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Card({
  title,
  actions,
  children,
  className = "",
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    // min-w-0: inside a grid, wide tables must scroll within the card, not widen the page.
    <section className={`min-w-0 rounded-2xl border border-line bg-surface p-5 shadow-[0_20px_60px_-40px_#000] sm:p-6 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="font-display text-base font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className = "",
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium tracking-wide text-fg-muted uppercase">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Turns an API error code into a readable Russian message. */
export function useErrorText() {
  const t = useTranslations("Admin.errors");
  return (error: unknown): string => {
    if (error instanceof ApiError) {
      const key = error.code as Parameters<typeof t>[0];
      if (t.has(key)) return t(key);
      if (error.status === 422 && error.fields.length) {
        return t("validation", { fields: error.fields.map((f) => f.field).join(", ") });
      }
      return error.detail ?? t("generic");
    }
    return t("network");
  };
}

export function ErrorBox({ error }: { error: unknown }) {
  const text = useErrorText();
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm">
      {text(error)}
    </p>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="text-sm text-success">
      {children}
    </p>
  );
}

export function Loading() {
  const t = useTranslations("Admin");
  return (
    <p role="status" className="py-10 text-sm text-fg-muted">
      {t("loading")}
    </p>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-fg-muted">{text}</p>;
}

const STATUS_STYLE: Record<string, string> = {
  pending: "border-warning/40 bg-warning/10 text-warning",
  confirmed: "border-accent/40 bg-accent/10 text-accent",
  in_progress: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  completed: "border-success/40 bg-success/10 text-success",
  cancelled: "border-line text-fg-muted line-through",
  no_show: "border-danger/40 bg-danger/10 text-danger",
};

export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("Admin.status");
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLE[status] ?? ""}`}>
      {t(status as "pending")}
    </span>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const t = useTranslations("Admin");
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav aria-label={t("pagination")} className="mt-4 flex items-center justify-between gap-4 text-sm">
      <span className="text-fg-muted">{t("pageOf", { page, pages, total })}</span>
      <div className="flex gap-2">
        <Btn onClick={() => onPage(page - 1)} disabled={page <= 1}>
          {t("prev")}
        </Btn>
        <Btn onClick={() => onPage(page + 1)} disabled={page >= pages}>
          {t("next")}
        </Btn>
      </div>
    </nav>
  );
}

/** Native modal dialog: focus is trapped and Escape closes it, by the browser itself. */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="dialog-title"
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-6 text-fg shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <h2 id="dialog-title" className="font-display text-lg font-semibold">
        {title}
      </h2>
      <div className="mt-4">{open && children}</div>
    </dialog>
  );
}

const LOCALES = ["ru", "kk", "en"] as const;
type I18n = Partial<Record<(typeof LOCALES)[number], string>>;

/** One input per language. For required texts Russian must be filled (the API rejects
 * texts without it); optional texts (captions, bios) may stay empty in every language. */
export function I18nInputs({
  id,
  label,
  value,
  onChange,
  multiline = false,
  required = true,
}: {
  id: string;
  label: string;
  value: I18n | null | undefined;
  onChange: (value: I18n) => void;
  multiline?: boolean;
  required?: boolean;
}) {
  const Tag = multiline ? "textarea" : "input";
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-xs font-medium tracking-wide text-fg-muted uppercase">{label}</legend>
      {LOCALES.map((locale) => (
        <div key={locale} className="flex items-start gap-2">
          <label htmlFor={`${id}-${locale}`} className="w-8 pt-2.5 text-xs text-fg-muted uppercase">
            {locale}
            {required && locale === "ru" && <span aria-hidden="true" className="text-accent">*</span>}
          </label>
          <Tag
            id={`${id}-${locale}`}
            value={value?.[locale] ?? ""}
            required={required && locale === "ru"}
            rows={multiline ? 3 : undefined}
            onChange={(e) => onChange({ ...value, [locale]: e.target.value })}
            className={`${inputCls} ${multiline ? "py-2" : ""}`}
          />
        </div>
      ))}
    </fieldset>
  );
}

/** Drops empty languages so optional translations are not sent as "". */
export const cleanI18n = (value: I18n | null | undefined) =>
  Object.fromEntries(Object.entries(value ?? {}).filter(([, v]) => v && v.trim())) as I18n;
