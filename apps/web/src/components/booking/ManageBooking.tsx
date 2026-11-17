"use client";

import { CalendarPlus, CheckCircle2, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ButtonLink, buttonClass } from "@/components/ui/primitives";
import type { Locale } from "@/i18n/routing";
import { apiFetch, buildIcs, formatDay, type ApiError, type BookingView } from "@/lib/booking";
import { whatsappHref } from "@/lib/format";
import { PriceSummary } from "./PriceSummary";

type Site = { business_name: string; address: string; whatsapp: string | null };

// The token lives in the URL fragment: browsers never send it to any server or log.
// Read through useSyncExternalStore: null on the server, the real value in the browser.
const onHashChange = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const readToken = () => window.location.hash.slice(1);
const readIsNew = () => new URLSearchParams(window.location.search).has("new");

export function ManageBooking({ locale, site }: { locale: Locale; site: Site }) {
  const t = useTranslations("Manage");
  const tc = useTranslations("Common");
  const token = useSyncExternalStore(onHashChange, readToken, () => null);
  const isNew = useSyncExternalStore(onHashChange, readIsNew, () => false);
  const [booking, setBooking] = useState<BookingView | null>(null);
  const [loadError, setLoadError] = useState<"notFound" | "generic" | null>(null);
  const error = token === "" ? "missing" : loadError;
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiFetch<BookingView>("/bookings/lookup", { method: "POST", body: JSON.stringify({ token, locale }) })
      .then(setBooking)
      .catch((e: ApiError) => setLoadError(e.status === 404 ? "notFound" : "generic"));
  }, [token, locale]);

  async function cancel() {
    if (!token) return;
    setBusy(true);
    setCancelError(null);
    try {
      const updated = await apiFetch<BookingView>("/bookings/cancel", {
        method: "POST",
        body: JSON.stringify({ token, locale, reason: reason.trim() || null }),
      });
      setBooking(updated);
      setConfirmCancel(false);
    } catch (e) {
      setCancelError((e as ApiError).code === "CANCEL_NOT_ALLOWED" ? t("cancel.tooLate") : t("cancel.failed"));
    } finally {
      setBusy(false);
    }
  }

  function downloadIcs() {
    if (!booking) return;
    const file = buildIcs({
      uid: `${booking.reference}@autopoint`,
      title: `${site.business_name}: ${booking.lines.map((l) => l.name).join(", ")}`,
      start: booking.starts_at,
      end: booking.ends_at,
      location: site.address,
      description: `${t("reference")}: ${booking.reference}`,
    });
    const url = URL.createObjectURL(new Blob([file], { type: "text/calendar" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${booking.reference}.ics` });
    a.click();
    URL.revokeObjectURL(url);
  }

  if (error) {
    return (
      <div role="alert">
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">{t(`errors.${error}.title`)}</h1>
        <p className="mt-4 max-w-xl text-fg-muted">{t(`errors.${error}.lead`)}</p>
        <ButtonLink href="/booking" className="mt-8">
          {tc("book")}
        </ButtonLink>
      </div>
    );
  }
  if (!booking) {
    return (
      <p role="status" className="text-fg-muted">
        {t("loading")}
      </p>
    );
  }

  const when = (p: BookingView["starts"]) =>
    `${formatDay(p.date, locale, { weekday: "long", day: "numeric", month: "long" })}, ${p.time}`;
  const cancelled = booking.status === "cancelled";

  return (
    <div className="grid gap-10 lg:grid-cols-12">
      <div className="lg:col-span-7">
        {isNew && !cancelled && (
          <div role="status" className="mb-8 flex gap-3 border border-success/50 bg-success/10 p-5">
            <CheckCircle2 className="size-6 shrink-0 text-success" aria-hidden="true" />
            <div>
              <p className="font-semibold">{t("created")}</p>
              <p className="mt-1 text-sm text-fg-muted">{t("createdLead")}</p>
            </div>
          </div>
        )}
        <p className="eyebrow">{t("reference")}</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-wider tabular-nums sm:text-5xl">
          {booking.reference}
        </h1>
        <p className="mt-4">
          <span
            className={`inline-flex rounded-full border px-3 py-1 text-xs ${cancelled ? "border-danger/50 text-danger" : "border-accent/50 text-accent"}`}
          >
            {t(`status.${booking.status as "pending"}`)}
          </span>
        </p>

        <dl className="mt-8 divide-y divide-line border-y border-line">
          <div className="py-4">
            <dt className="text-xs tracking-[0.12em] text-fg-muted uppercase">{t("when")}</dt>
            <dd className="mt-1 text-lg">
              {when(booking.starts)}
              {booking.ends.date !== booking.starts.date && (
                <span className="block text-sm text-fg-muted">{t("until", { when: when(booking.ends) })}</span>
              )}
            </dd>
          </div>
          <div className="py-4">
            <dt className="text-xs tracking-[0.12em] text-fg-muted uppercase">{t("vehicle")}</dt>
            <dd className="mt-1">{booking.vehicle}</dd>
          </div>
          <div className="py-4">
            <dt className="text-xs tracking-[0.12em] text-fg-muted uppercase">{t("contact")}</dt>
            <dd className="mt-1">
              {booking.customer_name} · <span className="tabular-nums">{booking.phone_masked}</span>
            </dd>
          </div>
        </dl>

        {!cancelled && (
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={downloadIcs} className={buttonClass("secondary")}>
              <CalendarPlus className="size-4" aria-hidden="true" />
              {t("addToCalendar")}
            </button>
            {site.whatsapp && (
              <a
                href={whatsappHref(site.whatsapp, t("whatsappText", { reference: booking.reference }))}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass("secondary")}
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                WhatsApp
              </a>
            )}
          </div>
        )}

        {!cancelled && (
          <section className="mt-12 border-t border-line pt-8" aria-labelledby="cancel-title">
            <h2 id="cancel-title" className="font-display text-xl font-semibold">
              {t("cancel.title")}
            </h2>
            {booking.can_cancel ? (
              <>
                <p className="mt-2 text-sm text-fg-muted">
                  {t("cancel.until", { when: when(booking.cancel_until) })}
                </p>
                {confirmCancel ? (
                  <div className="mt-4 space-y-4">
                    <label htmlFor="cancel-reason" className="block text-sm font-medium">
                      {t("cancel.reason")}
                    </label>
                    <textarea
                      id="cancel-reason"
                      rows={2}
                      maxLength={500}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full border border-line bg-surface px-4 py-3"
                    />
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button type="button" onClick={cancel} disabled={busy} className={buttonClass("primary", "bg-danger text-fg hover:bg-danger/85")}>
                        {t("cancel.confirm")}
                      </button>
                      <button type="button" onClick={() => setConfirmCancel(false)} className={buttonClass("secondary")}>
                        {t("cancel.keep")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmCancel(true)} className={buttonClass("secondary", "mt-4")}>
                    {t("cancel.start")}
                  </button>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-fg-muted">{t("cancel.tooLate")}</p>
            )}
            {cancelError && (
              <p role="alert" className="mt-4 text-sm text-danger">
                {cancelError}
              </p>
            )}
          </section>
        )}
      </div>

      <aside className="lg:col-span-5">
        <div className="border border-line bg-surface/40 p-6">
          <h2 className="font-display text-lg font-semibold">{t("services")}</h2>
          <PriceSummary
            locale={locale}
            lines={booking.lines.map((l) => ({ name: l.name, detail: l.options.join(", "), price: l.price_kzt }))}
            subtotal={booking.subtotal_kzt}
            discount={booking.discount}
            total={booking.total_kzt}
          />
          <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-fg-muted">{tc("priceNote")}</p>
        </div>
      </aside>
    </div>
  );
}
