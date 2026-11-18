"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, Hourglass, Wallet } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BarChart } from "@/components/admin/BarChart";
import { Card, Empty, ErrorBox, Loading, PageHeader, StatusBadge } from "@/components/admin/ui";
import { api, localTime, type BookingsPage, type Summary } from "@/lib/admin/api";
import { useAuth } from "@/lib/admin/auth";
import { formatDay } from "@/lib/booking";
import { formatKzt } from "@/lib/format";

function TodayList() {
  const t = useTranslations("Admin.dashboard");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(new Date());
  const q = useQuery({
    queryKey: ["bookings", "today", today],
    queryFn: () =>
      api<BookingsPage>(
        `/admin/bookings?date_from=${today}&date_to=${today}&status=pending&status=confirmed&status=in_progress&status=completed&page_size=100`,
      ),
  });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data.items.length) return <Empty text={t("noToday")} />;
  return (
    <ul className="divide-y divide-line">
      {q.data.items.map((b) => (
        <li key={b.id}>
          <Link href={`/admin/bookings/${b.id}`} className="-mx-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-3 py-3 transition-colors hover:bg-white/[0.04]">
            <span className="rounded-lg bg-accent/10 px-2 py-1 text-sm font-semibold text-accent tabular-nums">{localTime(b.starts_at)}</span>
            <span className="flex-1">
              {b.services.join(", ")} · <span className="text-fg-muted">{b.customer_name}</span>
            </span>
            <span className="text-sm text-fg-muted">{b.employee.name}</span>
            <StatusBadge status={b.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardPage() {
  const t = useTranslations("Admin.dashboard");
  const { can } = useAuth();
  const q = useQuery({
    queryKey: ["analytics"],
    queryFn: () => api<Summary>("/admin/analytics"),
    enabled: can("analytics.read"),
  });

  return (
    <>
      <PageHeader title={t("title")} />
      {can("analytics.read") &&
        (q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorBox error={q.error} />
        ) : (
          <>
            <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {(
                [
                  ["today", String(q.data.today_bookings), CalendarDays, "bg-sky-400/10 text-sky-300"],
                  ["pending", String(q.data.pending_upcoming), Hourglass, "bg-warning/10 text-warning"],
                  ["confirmed", String(q.data.confirmed_upcoming), CheckCircle2, "bg-success/10 text-success"],
                  ["revenue", formatKzt(q.data.revenue_kzt, "ru"), Wallet, "bg-accent/10 text-accent"],
                ] as const
              ).map(([key, value, Icon, tone]) => (
                <div key={key} className="relative rounded-2xl border border-line bg-surface p-5">
                  <span aria-hidden="true" className={`absolute top-5 right-5 grid size-10 place-items-center rounded-xl ${tone}`}>
                    <Icon className="size-5" strokeWidth={1.75} />
                  </span>
                  <dt className="pr-12 text-xs tracking-wide text-fg-muted uppercase">{t(`tiles.${key}`)}</dt>
                  <dd className="mt-3 font-display text-3xl font-semibold tabular-nums">{value}</dd>
                  {key === "revenue" && (
                    <dd className="mt-1 text-xs text-fg-muted">{t("revenueNote", { completed: q.data.completed })}</dd>
                  )}
                </div>
              ))}
            </dl>
            <Card className="mt-6">
              <BarChart
                title={t("chartTitle")}
                valueLabel={t("chartValue")}
                tableLabel={t("chartTable")}
                data={q.data.days.map((d) => ({
                  label: formatDay(d.date, "ru", { weekday: "short", day: "numeric", month: "long" }),
                  short: formatDay(d.date, "ru", { day: "numeric", month: "short" }),
                  value: d.bookings,
                  detail: d.revenue_kzt ? t("chartRevenue", { amount: formatKzt(d.revenue_kzt, "ru") }) : undefined,
                }))}
              />
            </Card>
          </>
        ))}
      <Card title={t("todayTitle")} className="mt-6">
        <TodayList />
      </Card>
    </>
  );
}
