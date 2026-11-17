"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { buttonClass } from "@/components/ui/primitives";
import { Link, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { ServiceCard, ServiceDetail, VehicleCategory } from "@/lib/api/client";
import {
  apiFetch,
  contactsSchema,
  formatDay,
  type ApiError,
  type Availability,
  type BookingCreated,
  type ContactsForm,
  type Quote,
} from "@/lib/booking";
import { durationParts, formatKzt } from "@/lib/format";
import { PriceSummary } from "./PriceSummary";

const STEPS = ["service", "vehicle", "options", "datetime", "contacts", "review", "confirm"] as const;
const WINDOW_DAYS = 14;
type Slot = { date: string; start: string; time: string };

function todayInAstana(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(new Date());
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function BookingWizard({
  locale,
  services,
  vehicles,
  initialService,
}: {
  locale: Locale;
  services: ServiceCard[];
  vehicles: VehicleCategory[];
  initialService: string | null;
}) {
  const t = useTranslations("Booking");
  const tc = useTranslations("Common");
  const router = useRouter();

  const [step, setStep] = useState(initialService ? 1 : 0);
  const [service, setService] = useState<string | null>(initialService);
  const [vehicle, setVehicle] = useState<string | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [addons, setAddons] = useState<string[]>([]);
  const [detail, setDetail] = useState<ServiceDetail | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [windowStart, setWindowStart] = useState(todayInAstana);
  const [loaded, setLoaded] = useState<{ key: string; data: Availability } | null>(null);
  const [availabilityVersion, setAvailabilityVersion] = useState(0);
  const [picked, setPicked] = useState<{ key: string; day: string | null; slot: Slot | null } | null>(null);
  const [contacts, setContacts] = useState<ContactsForm | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // One key per wizard session: a retried request returns the same booking, never a second one.
  const idempotencyKey = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const selection = useMemo(
    () => (service && vehicle ? { service, vehicle, options, addons, locale } : null),
    [service, vehicle, options, addons, locale],
  );
  const selectionKey = JSON.stringify(selection);
  const requestKey = `${selectionKey}|${windowStart}|${availabilityVersion}`;
  const availability = loaded?.key === requestKey ? loaded.data : null;
  // Changing what is booked invalidates the chosen day and time.
  const current = picked?.key === selectionKey ? picked : null;
  const slot = current?.slot ?? null;
  const day = current?.day ?? availability?.days.find((d) => d.slots.length)?.date ?? null;
  const setDay = (d: string) => setPicked({ key: selectionKey, day: d, slot: null });
  const setSlot = (s: Slot | null) => setPicked({ key: selectionKey, day: s?.date ?? day, slot: s });

  // Service details (options, which vehicle classes are priced).
  useEffect(() => {
    if (!service) return;
    let live = true;
    apiFetch<ServiceDetail>(`/services/${service}?locale=${locale}`)
      .then((d) => live && setDetail(d))
      .catch(() => live && setDetail(null));
    return () => {
      live = false;
    };
  }, [service, locale]);

  // Live quote from the backend: the only source of prices.
  useEffect(() => {
    if (!selection) return;
    let live = true;
    const timer = setTimeout(() => {
      apiFetch<Quote>("/quotes", { method: "POST", body: JSON.stringify(selection) })
        .then((q) => {
          if (!live) return;
          setQuote(q);
          setQuoteError(null);
        })
        .catch((e: ApiError) => {
          if (!live) return;
          setQuote(null);
          setQuoteError(e.code);
        });
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectionKey captures selection
  }, [selectionKey]);

  // Available start times (computed only on the server).
  useEffect(() => {
    if (!selection || step !== 3) return;
    let live = true;
    const params = new URLSearchParams({
      service: selection.service,
      vehicle: selection.vehicle,
      date_from: windowStart,
      date_to: addDays(windowStart, WINDOW_DAYS - 1),
    });
    selection.options.forEach((o) => params.append("options", o));
    selection.addons.forEach((a) => params.append("addons", a));
    apiFetch<Availability>(`/availability?${params}`)
      .then((data) => live && setLoaded({ key: requestKey, data }))
      .catch(() => live && setLoaded({ key: requestKey, data: { timezone: "", duration_min: 0, days: [] } }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey captures the inputs
  }, [requestKey, step]);

  // Move focus to the new step's heading (keyboard and screen-reader users).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);

  const form = useForm<ContactsForm>({
    resolver: zodResolver(contactsSchema),
    defaultValues: contacts ?? {
      name: "",
      phone: "",
      email: "",
      vehicleNote: "",
      comment: "",
      consent: false as unknown as true,
      website: "",
    },
  });

  const serviceCard = services.find((s) => s.slug === service);
  const pricedVehicles = new Set(detail?.prices.map((p) => p.vehicle_code));
  const groups = useMemo(() => {
    const map = new Map<string | null, ServiceDetail["options"]>();
    for (const o of detail?.options ?? []) map.set(o.group_code, [...(map.get(o.group_code) ?? []), o]);
    return map;
  }, [detail]);
  const addonCandidates = services.filter((s) => s.addon_eligible && s.slug !== service);

  const canContinue = [
    !!service,
    !!vehicle && (!detail || pricedVehicles.has(vehicle)),
    !!quote,
    !!slot,
    true, // the form validates itself on submit
    !!quote && !!slot && !!contacts,
  ][step];

  function go(to: number) {
    setSubmitError(null);
    setStep(to);
  }

  function pickOption(code: string, group: string | null) {
    setOptions((current) => {
      if (group === null) return current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
      const sameGroup = new Set(groups.get(group)?.map((o) => o.code));
      return [...current.filter((c) => !sameGroup.has(c)), code];
    });
  }

  function isOptionSelected(code: string, group: string | null) {
    if (options.includes(code)) return true;
    if (group === null) return false;
    const groupCodes = groups.get(group)?.map((o) => o.code) ?? [];
    return !groupCodes.some((c) => options.includes(c)) && !!groups.get(group)?.find((o) => o.code === code)?.is_default;
  }

  async function submit() {
    if (!selection || !slot || !contacts) return;
    setSubmitting(true);
    setSubmitError(null);
    setStep(6);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const created = await apiFetch<BookingCreated>("/bookings", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey.current },
        body: JSON.stringify({
          selection,
          starts_at: slot.start,
          customer: { name: contacts.name, phone: contacts.phone, email: contacts.email || null },
          vehicle_note: contacts.vehicleNote || null,
          comment: contacts.comment || null,
          consent: true,
          website: contacts.website,
        }),
      });
      router.push(`/booking/manage?new=1#${created.manage_token}`);
    } catch (e) {
      const code = (e as ApiError).code;
      setSubmitting(false);
      if (code === "SLOT_UNAVAILABLE") {
        setSlot(null);
        setAvailabilityVersion((v) => v + 1);
        setStep(3);
        setSubmitError(t("errors.SLOT_UNAVAILABLE"));
        return;
      }
      setStep(5);
      const known = ["TOO_MANY_ACTIVE_BOOKINGS", "RATE_LIMITED", "NETWORK"] as const;
      setSubmitError(
        known.includes(code as (typeof known)[number])
          ? t(`errors.${code as (typeof known)[number]}`)
          : t("errors.generic"),
      );
    }
  }

  const choice =
    "flex w-full items-start justify-between gap-4 border p-5 text-left transition-colors aria-checked:border-accent aria-checked:bg-surface hover:border-fg/40 disabled:cursor-not-allowed disabled:opacity-40";

  const title = t(`steps.${STEPS[step]}`);

  return (
    <>
      <ol className="flex gap-1" aria-label={t("progress")}>
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? "step" : undefined}
            className={`h-1 flex-1 rounded-full ${i <= step ? "bg-accent" : "bg-line"}`}
          >
            <span className="sr-only">
              {t(`steps.${s}`)}
              {i < step ? ` — ${t("done")}` : ""}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-10 grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <p className="text-xs tracking-[0.12em] text-fg-muted uppercase">
            {t("stepOf", { current: Math.min(step + 1, STEPS.length), total: STEPS.length })}
          </p>
          <h2 ref={heading} tabIndex={-1} className="mt-2 font-display text-2xl font-semibold outline-none sm:text-3xl">
            {title}
          </h2>
          {submitError && (
            <p role="alert" className="mt-4 border border-danger/50 bg-danger/10 p-4 text-sm">
              {submitError}
            </p>
          )}

          {/* key remounts the step so the CSS entry animation replays; content never waits on it. */}
          <div key={step} className="step-enter mt-8">
              {step === 0 && (
                <div role="radiogroup" aria-label={title} className="grid gap-3 sm:grid-cols-2">
                  {services.map((s) => (
                    <button
                      key={s.slug}
                      type="button"
                      role="radio"
                      aria-checked={service === s.slug}
                      onClick={() => {
                        if (service !== s.slug) {
                          setService(s.slug);
                          setDetail(null);
                          setOptions([]);
                          setAddons((a) => a.filter((x) => x !== s.slug));
                        }
                      }}
                      className={`${choice} border-line`}
                    >
                      <span>
                        <span className="block font-semibold">{s.name}</span>
                        <span className="mt-1 block text-sm text-fg-muted">{s.summary}</span>
                      </span>
                      {s.price_from_kzt != null && (
                        <span className="shrink-0 text-sm text-accent tabular-nums">
                          {tc("priceFrom", { price: formatKzt(s.price_from_kzt, locale) })}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {step === 1 && (
                <div role="radiogroup" aria-label={title} className="grid gap-3 sm:grid-cols-2">
                  {vehicles.map((v) => {
                    const price = detail?.prices.find((p) => p.vehicle_code === v.code);
                    return (
                      <button
                        key={v.code}
                        type="button"
                        role="radio"
                        aria-checked={vehicle === v.code}
                        disabled={!!detail && !price}
                        onClick={() => setVehicle(v.code)}
                        className={`${choice} border-line`}
                      >
                        <span>
                          <span className="block font-semibold">{v.name}</span>
                          {v.examples && <span className="mt-1 block text-sm text-fg-muted">{v.examples}</span>}
                        </span>
                        {price && (
                          <span className="shrink-0 text-sm text-accent tabular-nums">
                            {formatKzt(price.price_kzt, locale)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-10">
                  {[...groups.entries()].map(([group, items]) => (
                    <fieldset key={group ?? "extras"}>
                      <legend className="text-sm font-semibold">
                        {group === null ? t("options.extras") : t("options.choose")}
                      </legend>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {items.map((o) => {
                          const price = o.prices.find((p) => p.vehicle_code === vehicle)?.price_kzt ?? 0;
                          const selected = isOptionSelected(o.code, group);
                          return (
                            <button
                              key={o.code}
                              type="button"
                              role={group === null ? "checkbox" : "radio"}
                              aria-checked={selected}
                              onClick={() => pickOption(o.code, group)}
                              className={`${choice} border-line`}
                            >
                              <span className="font-medium">{o.name}</span>
                              <span className="shrink-0 text-sm text-fg-muted tabular-nums">
                                {price === 0 ? t("options.included") : `+${formatKzt(price, locale)}`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  ))}
                  {addonCandidates.length > 0 && (
                    <fieldset>
                      <legend className="text-sm font-semibold">{t("options.addons")}</legend>
                      <p className="mt-1 text-sm text-fg-muted">{t("options.addonsLead")}</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {addonCandidates.map((a) => (
                          <button
                            key={a.slug}
                            type="button"
                            role="checkbox"
                            aria-checked={addons.includes(a.slug)}
                            onClick={() =>
                              setAddons((c) => (c.includes(a.slug) ? c.filter((x) => x !== a.slug) : [...c, a.slug]))
                            }
                            className={`${choice} border-line`}
                          >
                            <span className="font-medium">{a.name}</span>
                            {a.price_from_kzt != null && (
                              <span className="shrink-0 text-sm text-fg-muted tabular-nums">
                                {tc("priceFrom", { price: formatKzt(a.price_from_kzt, locale) })}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  {quoteError && (
                    <p role="alert" className="text-sm text-danger">
                      {t("errors.quote")}
                    </p>
                  )}
                </div>
              )}

              {step === 3 && (
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={() => setWindowStart((w) => addDays(w, -WINDOW_DAYS))}
                      disabled={windowStart <= todayInAstana()}
                      className="inline-flex min-h-11 items-center gap-1 text-sm text-fg-muted hover:text-fg disabled:opacity-30"
                    >
                      <ChevronLeft className="size-4" aria-hidden="true" />
                      {t("datetime.earlier")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setWindowStart((w) => addDays(w, WINDOW_DAYS))}
                      className="inline-flex min-h-11 items-center gap-1 text-sm text-fg-muted hover:text-fg"
                    >
                      {t("datetime.later")}
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                  {!availability ? (
                    <p className="mt-6 text-sm text-fg-muted" role="status">
                      {t("datetime.loading")}
                    </p>
                  ) : (
                    <>
                      <div role="radiogroup" aria-label={t("datetime.day")} className="mt-4 flex gap-2 overflow-x-auto pb-2">
                        {availability.days.map((d) => (
                          <button
                            key={d.date}
                            type="button"
                            role="radio"
                            aria-checked={day === d.date}
                            disabled={d.slots.length === 0}
                            onClick={() => setDay(d.date)}
                            className="flex min-w-16 flex-col items-center border border-line px-3 py-3 text-sm transition-colors aria-checked:border-accent aria-checked:bg-surface disabled:opacity-30"
                          >
                            <span className="text-xs text-fg-muted">{formatDay(d.date, locale, { weekday: "short" })}</span>
                            <span className="font-display text-lg font-semibold">{formatDay(d.date, locale, { day: "numeric" })}</span>
                            <span className="text-xs text-fg-muted">{formatDay(d.date, locale, { month: "short" })}</span>
                          </button>
                        ))}
                      </div>
                      {availability.days.every((d) => d.slots.length === 0) && (
                        <p className="mt-6 text-sm text-fg-muted">{t("datetime.none")}</p>
                      )}
                      {day && (
                        <div className="mt-6">
                          <p className="text-sm font-semibold">
                            {formatDay(day, locale, { weekday: "long", day: "numeric", month: "long" })}
                          </p>
                          <div role="radiogroup" aria-label={t("datetime.time")} className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                            {availability.days
                              .find((d) => d.date === day)
                              ?.slots.map((s) => (
                                <button
                                  key={s.start}
                                  type="button"
                                  role="radio"
                                  aria-checked={slot?.start === s.start}
                                  onClick={() => setSlot({ date: day, start: s.start, time: s.time })}
                                  className="min-h-11 border border-line text-sm tabular-nums transition-colors aria-checked:border-accent aria-checked:bg-accent aria-checked:text-accent-fg hover:border-fg/40"
                                >
                                  {s.time}
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                      <p className="mt-6 text-xs text-fg-muted">{t("datetime.timezone")}</p>
                    </>
                  )}
                </div>
              )}

              {step === 4 && (
                <form
                  id="contacts-form"
                  noValidate
                  onSubmit={form.handleSubmit((values) => {
                    setContacts(values);
                    go(5);
                  })}
                  className="grid gap-5 sm:grid-cols-2"
                >
                  {(
                    [
                      ["name", "text", "name", true],
                      ["phone", "tel", "tel", true],
                      ["email", "email", "email", false],
                      ["vehicleNote", "text", "off", false],
                    ] as const
                  ).map(([name, type, autoComplete, required]) => {
                    const error = form.formState.errors[name]?.message;
                    return (
                      <div key={name}>
                        <label htmlFor={`f-${name}`} className="text-sm font-medium">
                          {t(`contacts.${name}`)}
                          {required && <span aria-hidden="true" className="text-accent"> *</span>}
                        </label>
                        <input
                          id={`f-${name}`}
                          type={type}
                          autoComplete={autoComplete}
                          inputMode={name === "phone" ? "tel" : undefined}
                          placeholder={name === "phone" ? "+7 700 000 00 00" : undefined}
                          aria-invalid={!!error}
                          aria-required={required}
                          aria-describedby={error ? `f-${name}-error` : undefined}
                          {...form.register(name)}
                          className="mt-2 min-h-12 w-full border border-line bg-surface px-4 text-base aria-invalid:border-danger"
                        />
                        {error && (
                          <p id={`f-${name}-error`} className="mt-2 text-sm text-danger">
                            {t(`validation.${error as "nameTooShort"}`)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  <div className="sm:col-span-2">
                    <label htmlFor="f-comment" className="text-sm font-medium">
                      {t("contacts.comment")}
                    </label>
                    <textarea
                      id="f-comment"
                      rows={3}
                      {...form.register("comment")}
                      className="mt-2 w-full border border-line bg-surface px-4 py-3 text-base"
                    />
                  </div>
                  {/* Honeypot: hidden from people and assistive tech, bots tend to fill it. */}
                  <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" {...form.register("website")} />
                  <div className="sm:col-span-2">
                    <label className="flex items-start gap-3 text-sm leading-relaxed">
                      <input
                        type="checkbox"
                        aria-invalid={!!form.formState.errors.consent}
                        aria-describedby={form.formState.errors.consent ? "f-consent-error" : undefined}
                        {...form.register("consent")}
                        className="mt-1 size-5 accent-[var(--color-accent)]"
                      />
                      <span>
                        {t.rich("contacts.consent", {
                          link: (chunks) => (
                            <Link href="/privacy" target="_blank" className="underline hover:text-accent">
                              {chunks}
                            </Link>
                          ),
                        })}
                      </span>
                    </label>
                    {form.formState.errors.consent && (
                      <p id="f-consent-error" className="mt-2 text-sm text-danger">
                        {t("validation.consentRequired")}
                      </p>
                    )}
                  </div>
                </form>
              )}

              {(step === 5 || step === 6) && quote && slot && contacts && (
                <dl className="divide-y divide-line border-y border-line">
                  {(
                    [
                      ["service", 0, quote.lines.map((l) => [l.name, ...l.options.map((o) => o.name)].join(" · ")).join(", ")],
                      ["vehicle", 1, vehicles.find((v) => v.code === vehicle)?.name ?? ""],
                      [
                        "datetime",
                        3,
                        `${formatDay(slot.date, locale, { weekday: "long", day: "numeric", month: "long" })}, ${slot.time}`,
                      ],
                      ["contacts", 4, [contacts.name, contacts.phone, contacts.email].filter(Boolean).join(" · ")],
                    ] as const
                  ).map(([key, target, value]) => (
                    <div key={key} className="flex items-start justify-between gap-6 py-4">
                      <div>
                        <dt className="text-xs tracking-[0.12em] text-fg-muted uppercase">{t(`review.${key}`)}</dt>
                        <dd className="mt-1">{value}</dd>
                      </div>
                      {step === 5 && (
                        <button type="button" onClick={() => go(target)} className="min-h-11 text-sm text-accent hover:underline">
                          {t("edit")}
                        </button>
                      )}
                    </div>
                  ))}
                </dl>
              )}
              {step === 6 && (
                <p role="status" className="mt-6 text-sm text-fg-muted">
                  {t("submitting")}
                </p>
              )}
          </div>

          {step < 6 && (
            <div className="mt-10 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              {step > 0 ? (
                <button type="button" onClick={() => go(step - 1)} className={buttonClass("secondary")}>
                  {t("back")}
                </button>
              ) : (
                <span />
              )}
              {step === 4 ? (
                <button type="submit" form="contacts-form" className={buttonClass("primary")}>
                  {t("next")}
                </button>
              ) : step === 5 ? (
                <button type="button" onClick={submit} disabled={submitting || !canContinue} className={buttonClass("primary")}>
                  <Check className="size-4" aria-hidden="true" />
                  {t("confirm")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => go(step + 1)}
                  disabled={!canContinue}
                  className={buttonClass("primary", "disabled:opacity-40")}
                >
                  {t("next")}
                </button>
              )}
            </div>
          )}
        </div>

        <aside className="lg:col-span-4" aria-label={t("summary.title")}>
          <div className="border border-line bg-surface/40 p-6 lg:sticky lg:top-24">
            <h2 className="font-display text-lg font-semibold">{t("summary.title")}</h2>
            {serviceCard ? (
              <>
                <p className="mt-4 text-sm text-fg-muted">
                  {[serviceCard.name, vehicles.find((v) => v.code === vehicle)?.name].filter(Boolean).join(" · ")}
                </p>
                {slot && (
                  <p className="mt-1 text-sm text-fg-muted">
                    {formatDay(slot.date, locale, { day: "numeric", month: "long" })}, {slot.time}
                  </p>
                )}
                {quote ? (
                  <>
                    <PriceSummary
                      locale={locale}
                      lines={quote.lines.map((l) => ({
                        name: l.name,
                        detail: l.options.map((o) => o.name).join(", "),
                        price: l.price_kzt,
                      }))}
                      subtotal={quote.subtotal_kzt}
                      discount={quote.discount}
                      total={quote.total_kzt}
                    />
                    <p className="mt-3 text-sm text-fg-muted">
                      {t("summary.duration")}:{" "}
                      {(() => {
                        const d = durationParts(quote.duration_min, quote.duration_min);
                        return d.unit === "days"
                          ? tc("durationDaysSingle", { value: d.to })
                          : tc("durationHoursSingle", { value: d.to });
                      })()}
                    </p>
                  </>
                ) : (
                  <p className="mt-4 text-sm text-fg-muted">{t("summary.pickVehicle")}</p>
                )}
              </>
            ) : (
              <p className="mt-4 text-sm text-fg-muted">{t("summary.empty")}</p>
            )}
            <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-fg-muted">{tc("priceNote")}</p>
            <p className="mt-2 text-xs leading-relaxed text-fg-muted">{t("pendingNote")}</p>
          </div>
        </aside>
      </div>
    </>
  );
}
