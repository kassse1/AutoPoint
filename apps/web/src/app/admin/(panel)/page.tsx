"use client";

import { useQuery } from "@tanstack/react-query";
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
          <Link href={`/admin/bookings/${b.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:bg-surface">
            <span className="w-14 font-semibold tabular-nums">{localTime(b.starts_at)}</span>
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
            <dl className="grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
              {(
                [
                  ["today", String(q.data.today_bookings)],
                  ["pending", String(q.data.pending_upcoming)],
                  ["confirmed", String(q.data.confirmed_upcoming)],
                  ["revenue", formatKzt(q.data.revenue_kzt, "ru")],
                ] as const
              ).map(([key, value]) => (
                <div key={key} className="bg-bg p-5">
                  <dt className="text-xs tracking-wide text-fg-muted uppercase">{t(`tiles.${key}`)}</dt>
                  <dd className="mt-2 font-display text-3xl font-semibold tabular-nums">{value}</dd>
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
