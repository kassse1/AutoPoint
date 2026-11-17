"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Card, Empty, ErrorBox, Field, inputCls, Loading, PageHeader, Pagination } from "@/components/admin/ui";
import { api, localDate, type CustomersPage } from "@/lib/admin/api";
import { formatDay } from "@/lib/booking";
import { phoneDisplay } from "@/lib/format";

export default function CustomersPage() {
  const t = useTranslations("Admin.customers");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), page_size: "25" });
  if (search.trim()) params.set("q", search.trim());
  const q = useQuery({
    queryKey: ["customers", params.toString()],
    queryFn: () => api<CustomersPage>(`/admin/customers?${params}`),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader title={t("title")} />
      <Card>
        <Field label={t("search")} htmlFor="q" className="mb-4 max-w-sm">
          <input id="q" type="search" value={search} placeholder={t("searchHint")} className={inputCls}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </Field>
        {q.isPending ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : !q.data.items.length ? <Empty text={t("empty")} /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="text-xs tracking-wide text-fg-muted uppercase">
                  <tr className="border-b border-line">
                    <th scope="col" className="px-2 py-2 font-medium">{t("name")}</th>
                    <th scope="col" className="px-2 py-2 font-medium">{t("phone")}</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">{t("visits")}</th>
                    <th scope="col" className="px-2 py-2 font-medium">{t("lastVisit")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {q.data.items.map((c) => (
                    <tr key={c.id} className="hover:bg-surface">
                      <td className="px-2 py-2">
                        <Link href={`/admin/customers/${c.id}`} className="font-medium text-accent hover:underline">{c.name}</Link>
                        {c.email && <span className="block text-xs text-fg-muted">{c.email}</span>}
                      </td>
                      <td className="px-2 py-2 tabular-nums">{phoneDisplay(c.phone_e164)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{c.bookings}</td>
                      <td className="px-2 py-2">{c.last_visit ? formatDay(localDate(c.last_visit), "ru", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={25} total={q.data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
