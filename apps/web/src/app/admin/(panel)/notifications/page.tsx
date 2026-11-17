"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Btn, Card, Empty, ErrorBox, Loading, Notice, PageHeader, Pagination } from "@/components/admin/ui";
import { api, type NotificationsPage, type NotificationSummary } from "@/lib/admin/api";

const FILTERS = ["", "pending", "sent", "dead"] as const;

export default function NotificationsAdminPage() {
  const t = useTranslations("Admin.notifications");
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), page_size: "25" });
  if (status) params.set("status", status);
  const summary = useQuery({ queryKey: ["notifications", "summary"], queryFn: () => api<NotificationSummary>("/admin/notifications/summary"), refetchInterval: 10_000 });
  const list = useQuery({ queryKey: ["notifications", params.toString()], queryFn: () => api<NotificationsPage>(`/admin/notifications?${params}`), placeholderData: keepPreviousData, refetchInterval: 10_000 });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });
  const test = useMutation({ mutationFn: () => api("/admin/notifications/test", { method: "POST" }), onSuccess: refresh });
  const retry = useMutation({ mutationFn: (id: number) => api(`/admin/notifications/${id}/retry`, { method: "POST" }), onSuccess: refresh });
  const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Almaty" }).format(new Date(iso)) : "—");

  return (
    <>
      <PageHeader title={t("title")}>
        <Btn variant="primary" disabled={test.isPending} onClick={() => test.mutate()}>{t("test")}</Btn>
      </PageHeader>
      {summary.data && (
        <Card className="mb-6">
          <p className={summary.data.configured ? "text-success" : "text-warning"} role="status">
            {summary.data.configured ? t("configured") : t("notConfigured")}
          </p>
          <p className="mt-2 text-sm text-fg-muted">{t("counts", { pending: summary.data.pending, dead: summary.data.dead, sent: summary.data.sent_24h })}</p>
          {test.isSuccess && <div className="mt-2"><Notice>{summary.data.configured ? t("testQueued") : t("testQueuedNotConfigured")}</Notice></div>}
        </Card>
      )}
      <div role="group" aria-label={t("filter")} className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f || "all"} type="button" aria-pressed={status === f} onClick={() => { setStatus(f); setPage(1); }}
            className="min-h-9 rounded-full border border-line px-3 text-xs text-fg-muted aria-pressed:border-accent aria-pressed:text-fg">
            {t(`filters.${f || "all"}`)}
          </button>
        ))}
      </div>
      <Card>
        {list.isPending ? <Loading /> : list.error ? <ErrorBox error={list.error} /> : !list.data.items.length ? <Empty text={t("empty")} /> : (
          <>
            <ul className="divide-y divide-line text-sm">
              {list.data.items.map((n) => (
                <li key={n.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-mono text-xs">{n.event_type}</span>
                    <span className={`text-xs ${n.status === "dead" ? "text-danger" : n.status === "sent" ? "text-success" : "text-warning"}`}>
                      {t(`status.${n.status as "sent"}`)} · {t("attempts", { count: n.attempts })} · {when(n.sent_at ?? n.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-fg-muted">{n.text}</p>
                  {n.last_error && <p className="mt-1 text-xs text-danger">{n.last_error}</p>}
                  {n.status === "dead" && <Btn className="mt-2" onClick={() => retry.mutate(n.id)}>{t("retry")}</Btn>}
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={25} total={list.data.total} onPage={setPage} />
          </>
        )}
        <div className="mt-3"><ErrorBox error={test.error ?? retry.error} /></div>
      </Card>
    </>
  );
}
