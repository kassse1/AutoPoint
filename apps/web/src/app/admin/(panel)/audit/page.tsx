"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Card, Empty, ErrorBox, Field, inputCls, Loading, PageHeader, Pagination } from "@/components/admin/ui";
import { api, type AuditPage } from "@/lib/admin/api";

const ENTITIES = ["", "booking", "customer", "service", "service_option", "service_category", "vehicle_category", "discount_rule", "employee", "schedule_exception", "settings", "user"];

/** Compact "field: before → after" lines for one audit entry. */
function Changes({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  const show = (v: unknown) => (v === undefined ? "—" : typeof v === "string" ? v : JSON.stringify(v));
  return (
    <ul className="space-y-0.5 text-xs text-fg-muted">
      {keys.slice(0, 6).map((k) => (
        <li key={k} className="break-all">
          <span className="text-fg">{k}</span>: {before && k in before ? `${show(before[k])} → ` : ""}{show(after?.[k])}
        </li>
      ))}
      {keys.length > 6 && <li>…</li>}
    </ul>
  );
}

export default function AuditPage() {
  const t = useTranslations("Admin.audit");
  const [entity, setEntity] = useState("");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), page_size: "50" });
  if (entity) params.set("entity_type", entity);
  const q = useQuery({ queryKey: ["audit", params.toString()], queryFn: () => api<AuditPage>(`/admin/audit-logs?${params}`), placeholderData: keepPreviousData });

  return (
    <>
      <PageHeader title={t("title")} />
      <Card>
        <Field label={t("entity")} htmlFor="entity" className="mb-4 max-w-xs">
          <select id="entity" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} className={inputCls}>
            {ENTITIES.map((e) => <option key={e} value={e}>{e ? e : t("all")}</option>)}
          </select>
        </Field>
        {q.isPending ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : !q.data.items.length ? <Empty text={t("empty")} /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs tracking-wide text-fg-muted uppercase">
                  <tr className="border-b border-line">
                    <th scope="col" className="px-2 py-2 font-medium">{t("when")}</th>
                    <th scope="col" className="px-2 py-2 font-medium">{t("who")}</th>
                    <th scope="col" className="px-2 py-2 font-medium">{t("action")}</th>
                    <th scope="col" className="px-2 py-2 font-medium">{t("changes")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line align-top">
                  {q.data.items.map((a) => (
                    <tr key={a.id}>
                      <td className="px-2 py-2 whitespace-nowrap tabular-nums">
                        {new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Almaty" }).format(new Date(a.created_at))}
                      </td>
                      <td className="px-2 py-2">{a.actor_name ?? t(`actors.${a.actor_kind as "public"}`)}</td>
                      <td className="px-2 py-2">
                        <span className="font-mono text-xs">{a.action}</span>
                        <span className="block text-xs text-fg-muted">
                          {a.entity_type === "booking" ? (
                            <Link href={`/admin/bookings/${a.entity_id}`} className="hover:text-accent">{a.entity_type} {a.entity_id.slice(0, 8)}</Link>
                          ) : `${a.entity_type} ${a.entity_id.slice(0, 8)}`}
                        </span>
                      </td>
                      <td className="px-2 py-2"><Changes before={a.before ?? null} after={a.after ?? null} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={50} total={q.data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
