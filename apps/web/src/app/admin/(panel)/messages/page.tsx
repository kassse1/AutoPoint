"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Btn, Card, Empty, ErrorBox, Loading, PageHeader, Pagination } from "@/components/admin/ui";
import { api, type MessagesPage } from "@/lib/admin/api";
import { useAuth } from "@/lib/admin/auth";
import { phoneDisplay, telHref, whatsappHref } from "@/lib/format";

const FILTERS = ["new", "handled", "spam", ""] as const;

export default function MessagesAdminPage() {
  const t = useTranslations("Admin.messages");
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("new");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), page_size: "25" });
  if (status) params.set("status", status);
  const q = useQuery({ queryKey: ["messages", params.toString()], queryFn: () => api<MessagesPage>(`/admin/contact-messages?${params}`), placeholderData: keepPreviousData });
  const update = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) => api(`/admin/contact-messages/${id}`, { method: "PATCH", json: { status: value } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["messages"] }),
  });
  const when = (iso: string) => new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Almaty" }).format(new Date(iso));

  return (
    <>
      <PageHeader title={t("title")} />
      <div role="group" aria-label={t("filter")} className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f || "all"} type="button" aria-pressed={status === f} onClick={() => { setStatus(f); setPage(1); }}
            className="min-h-9 rounded-full border border-line px-3 text-xs text-fg-muted aria-pressed:border-accent aria-pressed:text-fg">
            {t(`filters.${f || "all"}`)}
          </button>
        ))}
      </div>
      <Card>
        {q.isPending ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : !q.data.items.length ? <Empty text={t("empty")} /> : (
          <>
            <ul className="divide-y divide-line">
              {q.data.items.map((m) => (
                <li key={m.id} className="py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">
                      {m.name} ·{" "}
                      <a href={telHref(m.phone)} className="tabular-nums hover:text-accent">{phoneDisplay(m.phone)}</a>
                      {" · "}
                      <a href={whatsappHref(m.phone)} target="_blank" rel="noopener noreferrer" className="hover:text-accent">WhatsApp</a>
                      {m.email && <span className="text-fg-muted"> · {m.email}</span>}
                    </p>
                    <p className="text-xs text-fg-muted">{when(m.created_at)} · {m.locale.toUpperCase()}</p>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">{m.message}</p>
                  {can("customers.write") && (
                    <div className="mt-3 flex gap-2">
                      {m.status !== "handled" && <Btn onClick={() => update.mutate({ id: m.id, value: "handled" })}>{t("markHandled")}</Btn>}
                      {m.status !== "spam" && <Btn variant="danger" onClick={() => update.mutate({ id: m.id, value: "spam" })}>{t("markSpam")}</Btn>}
                      {m.status !== "new" && <Btn onClick={() => update.mutate({ id: m.id, value: "new" })}>{t("markNew")}</Btn>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={25} total={q.data.total} onPage={setPage} />
          </>
        )}
        <div className="mt-3"><ErrorBox error={update.error} /></div>
      </Card>
    </>
  );
}
