"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Btn, Card, Empty, ErrorBox, Field, inputCls, Loading, PageHeader, Pagination, StatusBadge } from "@/components/admin/ui";
import { api, localDate, localTime, type BookingRow, type BookingsPage, type Employee } from "@/lib/admin/api";
import { useAuth } from "@/lib/admin/auth";
import { formatDay } from "@/lib/booking";
import { formatKzt } from "@/lib/format";

const STATUSES = ["pending", "confirmed", "in_progress", "completed", "cancelled", "no_show"] as const;
const DAY_START = 8;
const DAY_END = 21;
const todayAstana = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(new Date());
const shiftDay = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Day view: one column per employee, bookings placed by their local start/end time. */
function DayCalendar({ day, employees }: { day: string; employees: { id: number | string; name: string }[] }) {
  const t = useTranslations("Admin.bookings");
  const q = useQuery({
    queryKey: ["bookings", "calendar", day],
    queryFn: () =>
      api<BookingsPage>(
        `/admin/bookings?date_from=${day}&date_to=${day}&page_size=200&status=pending&status=confirmed&status=in_progress&status=completed&status=no_show`,
      ),
  });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const rows = q.data.items;
  const columns = employees.length
    ? employees
    : [...new Map(rows.map((b) => [b.employee.id, b.employee])).values()];
  const hours = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);
  const minutes = (iso: string, fallback: number) => {
    if (localDate(iso) !== day) return fallback; // multi-day jobs: clip to this day
    const [h, m] = localTime(iso).split(":").map(Number);
    return Math.min(Math.max(h * 60 + m, DAY_START * 60), DAY_END * 60);
  };
  const top = (m: number) => ((m - DAY_START * 60) / ((DAY_END - DAY_START) * 60)) * 100;

  if (!columns.length) return <Empty text={t("emptyDay")} />;
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[640px]" style={{ gridTemplateColumns: `3.5rem repeat(${columns.length}, minmax(10rem, 1fr))` }}>
        <div />
        {columns.map((c) => (
          <div key={c.id} className="border-b border-line px-2 pb-2 text-sm font-medium">
            {c.name}
          </div>
        ))}
        <div className="relative h-[52rem]">
          {hours.map((h) => (
            <span key={h} className="absolute right-2 -translate-y-1/2 text-xs text-fg-muted tabular-nums" style={{ top: `${top(h * 60)}%` }}>
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
        </div>
        {columns.map((c) => (
          <div key={c.id} className="relative h-[52rem] border-l border-line">
            {hours.map((h) => (
              <div key={h} className="absolute inset-x-0 border-t border-line/50" style={{ top: `${top(h * 60)}%` }} />
            ))}
            {rows
              .filter((b) => b.employee.id === c.id)
              .map((b) => {
                const start = minutes(b.starts_at, DAY_START * 60);
                const end = minutes(b.ends_at, DAY_END * 60);
                return (
                  <Link
                    key={b.id}
                    href={`/admin/bookings/${b.id}`}
                    className="absolute inset-x-1 overflow-hidden border-l-2 border-accent bg-surface-2 px-2 py-1 text-xs hover:bg-surface"
                    style={{ top: `${top(start)}%`, height: `max(2.25rem, ${top(end) - top(start)}%)` }}
                  >
                    <span className="font-semibold tabular-nums">
                      {localDate(b.starts_at) === day ? localTime(b.starts_at) : "…"}–{localDate(b.ends_at) === day ? localTime(b.ends_at) : "…"}
                    </span>{" "}
                    {b.services.join(", ")}
                    <span className="block text-fg-muted">{b.customer_name}</span>
                    <span className="mt-1 block"><StatusBadge status={b.status} /></span>
                  </Link>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Table({ rows }: { rows: BookingRow[] }) {
  const t = useTranslations("Admin.bookings");
  if (!rows.length) return <Empty text={t("empty")} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="text-xs tracking-wide text-fg-muted uppercase">
          <tr className="border-b border-line">
            {(["when", "reference", "customer", "services", "employee", "status", "total"] as const).map((c) => (
              <th key={c} scope="col" className={`px-2 py-2 font-medium ${c === "total" ? "text-right" : ""}`}>
                {t(`columns.${c}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((b) => (
            <tr key={b.id} className="hover:bg-surface">
              <td className="px-2 py-2 whitespace-nowrap tabular-nums">
                {formatDay(localDate(b.starts_at), "ru", { day: "numeric", month: "short" })}, {localTime(b.starts_at)}
              </td>
              <td className="px-2 py-2">
                <Link href={`/admin/bookings/${b.id}`} className="font-medium text-accent hover:underline">
                  {b.reference}
                </Link>
              </td>
              <td className="px-2 py-2">
                {b.customer_name}
                <span className="block text-xs text-fg-muted tabular-nums">{b.customer_phone}</span>
              </td>
              <td className="px-2 py-2">{b.services.join(", ")}</td>
              <td className="px-2 py-2">{b.employee.name}</td>
              <td className="px-2 py-2"><StatusBadge status={b.status} /></td>
              <td className="px-2 py-2 text-right tabular-nums">
                {formatKzt(b.final_amount_kzt ?? b.total_kzt, "ru")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BookingsPage() {
  const t = useTranslations("Admin.bookings");
  const ts = useTranslations("Admin.status");
  const { can } = useAuth();
  const [view, setView] = useState<"table" | "calendar">("table");
  const [day, setDay] = useState(todayAstana);
  const [filters, setFilters] = useState({ status: [] as string[], from: "", to: "", employee: "", q: "" });
  const [page, setPage] = useState(1);
  const update = (patch: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const employees = useQuery({
    queryKey: ["employees"],
    queryFn: () => api<Employee[]>("/admin/employees"),
    enabled: can("staff.read"),
  });
  const params = new URLSearchParams({ page: String(page), page_size: "25", sort: "-starts_at" });
  filters.status.forEach((s) => params.append("status", s));
  if (filters.from) params.set("date_from", filters.from);
  if (filters.to) params.set("date_to", filters.to);
  if (filters.employee) params.set("employee_id", filters.employee);
  if (filters.q.trim()) params.set("q", filters.q.trim());
  const list = useQuery({
    queryKey: ["bookings", "list", params.toString()],
    queryFn: () => api<BookingsPage>(`/admin/bookings?${params}`),
    placeholderData: keepPreviousData,
    enabled: view === "table",
  });
  const bookable = (employees.data ?? []).filter((e) => e.is_active && e.is_bookable);

  return (
    <>
      <PageHeader title={t("title")}>
        <div role="group" aria-label={t("view")} className="flex">
          {(["table", "calendar"] as const).map((v) => (
            <Btn key={v} variant={view === v ? "primary" : "secondary"} aria-pressed={view === v} onClick={() => setView(v)}>
              {t(`views.${v}`)}
            </Btn>
          ))}
        </div>
        {can("bookings.write") && (
          <Link href="/admin/bookings/new" className="inline-flex min-h-10 items-center border border-accent px-4 text-sm font-semibold text-accent hover:bg-accent hover:text-accent-fg">
            {t("new")}
          </Link>
        )}
      </PageHeader>

      {view === "calendar" ? (
        <Card
          actions={
            <div className="flex items-center gap-2">
              <Btn onClick={() => setDay((d) => shiftDay(d, -1))} aria-label={t("prevDay")}>←</Btn>
              <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className={`${inputCls} w-auto`} aria-label={t("day")} />
              <Btn onClick={() => setDay((d) => shiftDay(d, 1))} aria-label={t("nextDay")}>→</Btn>
              <Btn onClick={() => setDay(todayAstana())}>{t("today")}</Btn>
            </div>
          }
          title={formatDay(day, "ru", { weekday: "long", day: "numeric", month: "long" })}
        >
          <DayCalendar day={day} employees={bookable.map((e) => ({ id: e.id, name: e.display_name }))} />
        </Card>
      ) : (
        <Card>
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <Field label={t("search")} htmlFor="q">
              <input id="q" type="search" value={filters.q} onChange={(e) => update({ q: e.target.value })} placeholder={t("searchHint")} className={inputCls} />
            </Field>
            <Field label={t("from")} htmlFor="from">
              <input id="from" type="date" value={filters.from} onChange={(e) => update({ from: e.target.value })} className={inputCls} />
            </Field>
            <Field label={t("to")} htmlFor="to">
              <input id="to" type="date" value={filters.to} onChange={(e) => update({ to: e.target.value })} className={inputCls} />
            </Field>
            {can("staff.read") && (
              <Field label={t("employee")} htmlFor="employee">
                <select id="employee" value={filters.employee} onChange={(e) => update({ employee: e.target.value })} className={inputCls}>
                  <option value="">{t("allEmployees")}</option>
                  {bookable.map((e) => (
                    <option key={e.id} value={e.id}>{e.display_name}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <div role="group" aria-label={t("statusFilter")} className="mb-4 flex flex-wrap gap-2">
            {STATUSES.map((s) => {
              const on = filters.status.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => update({ status: on ? filters.status.filter((x) => x !== s) : [...filters.status, s] })}
                  className="min-h-9 rounded-full border border-line px-3 text-xs text-fg-muted aria-pressed:border-accent aria-pressed:text-fg"
                >
                  {ts(s)}
                </button>
              );
            })}
          </div>
          {list.isPending ? (
            <Loading />
          ) : list.error ? (
            <ErrorBox error={list.error} />
          ) : (
            <>
              <Table rows={list.data.items} />
              <Pagination page={page} pageSize={25} total={list.data.total} onPage={setPage} />
            </>
          )}
        </Card>
      )}
    </>
  );
}
