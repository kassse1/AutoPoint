"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { PriceLines } from "@/components/admin/PriceLines";
import { Btn, Card, ErrorBox, Field, inputCls, PageHeader } from "@/components/admin/ui";
import { almatyIso, api, type BookingDetail, type Employee } from "@/lib/admin/api";
import type { ServiceCard, ServiceDetail, VehicleCategory } from "@/lib/api/client";
import type { Quote } from "@/lib/booking";

export default function NewBookingPage() {
  const t = useTranslations("Admin.newBooking");
  const router = useRouter();
  const idempotencyKey = useRef(crypto.randomUUID()); // a double click can't create two bookings
  const [form, setForm] = useState({
    service: "", vehicle: "", options: [] as string[], date: "", time: "10:00", employee: "",
    name: "", phone: "", email: "", comment: "", confirmed: true,
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const services = useQuery({ queryKey: ["public", "services"], queryFn: () => api<ServiceCard[]>("/public/services?locale=ru") });
  const vehicles = useQuery({ queryKey: ["public", "vehicles"], queryFn: () => api<VehicleCategory[]>("/public/vehicle-categories?locale=ru") });
  const employees = useQuery({ queryKey: ["employees"], queryFn: () => api<Employee[]>("/admin/employees") });
  const detail = useQuery({
    queryKey: ["public", "service", form.service],
    queryFn: () => api<ServiceDetail>(`/public/services/${form.service}?locale=ru`),
    enabled: !!form.service,
  });
  const selection = { service: form.service, vehicle: form.vehicle, options: form.options, addons: [], locale: "ru" };
  const quote = useQuery({
    queryKey: ["public", "quote", selection],
    queryFn: () => api<Quote>("/public/quotes", { method: "POST", json: selection }),
    enabled: !!form.service && !!form.vehicle,
  });
  const create = useMutation({
    mutationFn: () =>
      api<BookingDetail>("/admin/bookings", {
        method: "POST",
        idempotencyKey: idempotencyKey.current,
        json: {
          selection,
          starts_at: almatyIso(form.date, form.time),
          customer: { name: form.name, phone: form.phone, email: form.email || null },
          comment: form.comment || null,
          employee_id: form.employee ? Number(form.employee) : null,
          confirmed: form.confirmed,
        },
      }),
    onSuccess: (b) => router.push(`/admin/bookings/${b.id}`),
  });

  const groups = new Map<string | null, ServiceDetail["options"]>();
  for (const o of detail.data?.options ?? []) groups.set(o.group_code, [...(groups.get(o.group_code) ?? []), o]);
  const toggle = (code: string, group: string | null) => {
    const same = new Set(group ? groups.get(group)?.map((o) => o.code) : [code]);
    const on = form.options.includes(code);
    set({ options: [...form.options.filter((c) => !same.has(c)), ...(on && !group ? [] : [code])] });
  };

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/bookings" className="text-fg-muted hover:text-fg">← {t("back")}</Link>
      </p>
      <PageHeader title={t("title")} />
      <form
        className="grid gap-6 xl:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="space-y-6 xl:col-span-2">
          <Card title={t("what")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("service")} htmlFor="service">
                <select id="service" required value={form.service} onChange={(e) => set({ service: e.target.value, options: [] })} className={inputCls}>
                  <option value="" disabled>{t("choose")}</option>
                  {services.data?.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                </select>
              </Field>
              <Field label={t("vehicle")} htmlFor="vehicle">
                <select id="vehicle" required value={form.vehicle} onChange={(e) => set({ vehicle: e.target.value })} className={inputCls}>
                  <option value="" disabled>{t("choose")}</option>
                  {vehicles.data?.map((v) => <option key={v.code} value={v.code}>{v.name}</option>)}
                </select>
              </Field>
            </div>
            {groups.size > 0 && (
              <fieldset className="mt-4">
                <legend className="mb-2 text-xs font-medium tracking-wide text-fg-muted uppercase">{t("options")}</legend>
                <div className="flex flex-wrap gap-2">
                  {[...groups.entries()].flatMap(([group, items]) =>
                    items.map((o) => {
                      const on = form.options.includes(o.code) || (!!group && o.is_default && !items.some((x) => form.options.includes(x.code)));
                      return (
                        <button key={o.code} type="button" aria-pressed={on} onClick={() => toggle(o.code, group)}
                          className="min-h-9 rounded-full border border-line px-3 text-xs text-fg-muted aria-pressed:border-accent aria-pressed:text-fg">
                          {o.name}
                        </button>
                      );
                    }),
                  )}
                </div>
              </fieldset>
            )}
          </Card>

          <Card title={t("when")}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("date")} htmlFor="date">
                <input id="date" type="date" required value={form.date} onChange={(e) => set({ date: e.target.value })} className={inputCls} />
              </Field>
              <Field label={t("time")} htmlFor="time">
                <input id="time" type="time" step={1800} required value={form.time} onChange={(e) => set({ time: e.target.value })} className={inputCls} />
              </Field>
              <Field label={t("employee")} htmlFor="employee" hint={t("employeeHint")}>
                <select id="employee" value={form.employee} onChange={(e) => set({ employee: e.target.value })} className={inputCls}>
                  <option value="">{t("anyEmployee")}</option>
                  {employees.data?.filter((e) => e.is_bookable && e.is_active).map((e) => (
                    <option key={e.id} value={e.id}>{e.display_name}</option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>

          <Card title={t("customer")}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("name")} htmlFor="name">
                <input id="name" required minLength={2} value={form.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} />
              </Field>
              <Field label={t("phone")} htmlFor="phone">
                <input id="phone" type="tel" required value={form.phone} placeholder="+7 700 000 00 00" onChange={(e) => set({ phone: e.target.value })} className={inputCls} />
              </Field>
              <Field label={t("email")} htmlFor="email">
                <input id="email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} className={inputCls} />
              </Field>
              <Field label={t("comment")} htmlFor="comment" className="sm:col-span-3">
                <textarea id="comment" rows={2} value={form.comment} onChange={(e) => set({ comment: e.target.value })} className={`${inputCls} py-2`} />
              </Field>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.confirmed} onChange={(e) => set({ confirmed: e.target.checked })} className="size-4 accent-[var(--color-accent)]" />
              {t("confirmedNow")}
            </label>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title={t("price")}>
            {quote.data ? (
              <PriceLines
                lines={quote.data.lines.map((l) => ({ name: l.name, detail: l.options.map((o) => o.name).join(", "), price: l.price_kzt }))}
                discount={quote.data.discount ? { name: quote.data.discount.name, amount: quote.data.discount.amount_kzt } : null}
                total={quote.data.total_kzt}
              />
            ) : (
              <p className="text-sm text-fg-muted">{t("pickToPrice")}</p>
            )}
            {quote.error && <ErrorBox error={quote.error} />}
          </Card>
          <ErrorBox error={create.error} />
          <Btn type="submit" variant="primary" disabled={create.isPending} className="w-full">
            {t("submit")}
          </Btn>
        </div>
      </form>
    </>
  );
}
