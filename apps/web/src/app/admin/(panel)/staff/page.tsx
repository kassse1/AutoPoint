"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Btn, Card, ErrorBox, Field, inputCls, Loading, PageHeader } from "@/components/admin/ui";
import { api, type Employee } from "@/lib/admin/api";
import { useAuth } from "@/lib/admin/auth";

export default function StaffPage() {
  const t = useTranslations("Admin.staff");
  const { can } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["employees"], queryFn: () => api<Employee[]>("/admin/employees") });
  const [draft, setDraft] = useState({ name: "", position: "" });
  const create = useMutation({
    mutationFn: () => api<Employee>("/admin/employees", { method: "POST", json: { display_name: draft.name, position_i18n: { ru: draft.position } } }),
    onSuccess: (e) => { queryClient.invalidateQueries({ queryKey: ["employees"] }); router.push(`/admin/staff/${e.id}`); },
  });

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          {q.isPending ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : (
            <ul className="divide-y divide-line">
              {q.data.map((e) => (
                <li key={e.id}>
                  <Link href={`/admin/staff/${e.id}`} className={`flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-surface ${e.is_active ? "" : "text-fg-muted"}`}>
                    <span>
                      <span className="font-medium text-accent">{e.display_name}</span>
                      <span className="block text-xs text-fg-muted">{e.position_i18n.ru}</span>
                    </span>
                    <span className="text-xs text-fg-muted">
                      {[e.is_bookable ? t("bookable") : t("notBookable"), t("skills", { count: e.service_ids.length }),
                        e.user_id ? t("hasLogin") : null, e.is_demo ? t("demo") : null].filter(Boolean).join(" · ")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {can("staff.write") && (
          <Card title={t("new")}>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
              <Field label={t("name")} htmlFor="s-name"><input id="s-name" required minLength={2} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} /></Field>
              <Field label={t("positionRu")} htmlFor="s-pos"><input id="s-pos" required value={draft.position} onChange={(e) => setDraft({ ...draft, position: e.target.value })} className={inputCls} /></Field>
              <ErrorBox error={create.error} />
              <Btn type="submit" variant="primary" disabled={create.isPending}>{t("create")}</Btn>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
