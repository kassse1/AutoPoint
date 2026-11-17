"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { buttonClass } from "@/components/ui/primitives";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { apiFetch, normalizePhone, type ApiError } from "@/lib/booking";

/** Messages are keys under ContactForm.validation. */
export const contactFormSchema = z.object({
  name: z.string().trim().min(2, "nameTooShort").max(100, "tooLong"),
  phone: z.string().trim().refine((v) => normalizePhone(v) !== null, "phoneInvalid"),
  email: z
    .string()
    .trim()
    .max(200, "tooLong")
    .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "emailInvalid"),
  message: z.string().trim().min(10, "messageTooShort").max(2000, "tooLong"),
  consent: z.literal(true, { error: "consentRequired" }),
  website: z.string(), // honeypot
});
type Form = z.infer<typeof contactFormSchema>;

const FIELD = "mt-2 w-full border border-line bg-surface px-4 text-base aria-invalid:border-danger";

export function ContactForm({ locale }: { locale: Locale }) {
  const t = useTranslations("ContactForm");
  const [token, setToken] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Form>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: { name: "", phone: "", email: "", message: "", consent: false as unknown as true, website: "" },
  });
  const { errors, isSubmitting } = form.formState;

  // The token records when the form was opened; the API rejects instant (bot) submissions.
  useEffect(() => {
    apiFetch<{ token: string }>("/contact/token").then((r) => setToken(r.token)).catch(() => undefined);
  }, []);

  if (sent) {
    return (
      <div role="status" className="flex gap-3 border border-success/50 bg-success/10 p-6">
        <CheckCircle2 className="size-6 shrink-0 text-success" aria-hidden="true" />
        <div>
          <p className="font-semibold">{t("sentTitle")}</p>
          <p className="mt-1 text-sm text-fg-muted">{t("sentLead")}</p>
        </div>
      </div>
    );
  }

  const field = (name: "name" | "phone" | "email", type: string, autoComplete: string, required: boolean) => {
    const message = errors[name]?.message;
    return (
      <div>
        <label htmlFor={`cf-${name}`} className="text-sm font-medium">
          {t(name)}
          {required && <span aria-hidden="true" className="text-accent"> *</span>}
        </label>
        <input
          id={`cf-${name}`}
          type={type}
          autoComplete={autoComplete}
          aria-invalid={!!message}
          aria-describedby={message ? `cf-${name}-error` : undefined}
          {...form.register(name)}
          className={`${FIELD} min-h-12`}
        />
        {message && (
          <p id={`cf-${name}-error`} className="mt-2 text-sm text-danger">
            {t(`validation.${message as "nameTooShort"}`)}
          </p>
        )}
      </div>
    );
  };

  return (
    <form
      noValidate
      className="grid gap-5 sm:grid-cols-2"
      onSubmit={form.handleSubmit(async (values) => {
        setError(null);
        try {
          await apiFetch("/contact", {
            method: "POST",
            body: JSON.stringify({ ...values, email: values.email || null, locale, token }),
          });
          setSent(true);
        } catch (e) {
          const code = (e as ApiError).code;
          const known = ["TOO_FAST", "FORM_EXPIRED", "RATE_LIMITED", "NETWORK"] as const;
          setError(known.includes(code as (typeof known)[number]) ? t(`errors.${code as "TOO_FAST"}`) : t("errors.generic"));
        }
      })}
    >
      {field("name", "text", "name", true)}
      {field("phone", "tel", "tel", true)}
      <div className="sm:col-span-2">{field("email", "email", "email", false)}</div>
      <div className="sm:col-span-2">
        <label htmlFor="cf-message" className="text-sm font-medium">
          {t("message")}
          <span aria-hidden="true" className="text-accent"> *</span>
        </label>
        <textarea
          id="cf-message"
          rows={5}
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? "cf-message-error" : undefined}
          {...form.register("message")}
          className={`${FIELD} py-3`}
        />
        {errors.message && (
          <p id="cf-message-error" className="mt-2 text-sm text-danger">
            {t(`validation.${errors.message.message as "messageTooShort"}`)}
          </p>
        )}
      </div>
      {/* Honeypot: hidden from people and assistive tech; bots tend to fill it. */}
      <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" {...form.register("website")} />
      <div className="sm:col-span-2">
        <label className="flex items-start gap-3 text-sm leading-relaxed">
          <input type="checkbox" aria-invalid={!!errors.consent} {...form.register("consent")} className="mt-1 size-5 accent-[var(--color-accent)]" />
          <span>
            {t.rich("consent", {
              link: (chunks) => (
                <Link href="/privacy" target="_blank" className="underline hover:text-accent">
                  {chunks}
                </Link>
              ),
            })}
          </span>
        </label>
        {errors.consent && <p className="mt-2 text-sm text-danger">{t("validation.consentRequired")}</p>}
      </div>
      {error && (
        <p role="alert" className="border border-danger/50 bg-danger/10 p-4 text-sm sm:col-span-2">
          {error}
        </p>
      )}
      <div className="sm:col-span-2">
        <button type="submit" disabled={isSubmitting || !token} className={buttonClass("primary", "disabled:opacity-50")}>
          {isSubmitting ? t("sending") : t("submit")}
        </button>
      </div>
    </form>
  );
}
