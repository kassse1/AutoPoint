"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Btn, Card, ErrorBox, Field, inputCls, Loading, Notice, PageHeader, StatusBadge } from "@/components/admin/ui";
import { api, type CustomerDetail } from "@/lib/admin/api";
import { useAuth } from "@/lib/admin/auth";
import { formatDay } from "@/lib/booking";
import { formatKzt, phoneDisplay, telHref, whatsappHref } from "@/lib/format";

export default function CustomerPage() {
  const t = useTranslations("Admin.customers");
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["customer", id], queryFn: () => api<CustomerDetail>(`/admin/customers/${id}`) });
  const [draft, setDraft] = useState<{ name: string; email: string; notes: string } | null>(null);
  const save = useMutation({
    mutationFn: (json: object) => api<CustomerDetail>(`/admin/customers/${id}`, { method: "PATCH", json }),
    onSuccess: (data) => {
      queryClient.setQueryData(["customer", id], data);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setDraft(null);
    },
  });

  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const c = q.data;
  const form = draft ?? { name: c.name, email: c.email ?? "", notes: c.notes ?? "" };

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/customers" className="text-fg-muted hover:text-fg">← {t("back")}</Link></p>
      <PageHeader title={c.name} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title={t("profile")}>
          <p className="mb-4 text-sm tabular-nums">
            <a href={telHref(c.phone_e164)} className="hover:text-accent">{phoneDisplay(c.phone_e164)}</a>
            {" · "}
            <a href={whatsappHref(c.phone_e164)} target="_blank" rel="noopener noreferrer" className="hover:text-accent">WhatsApp</a>
          </p>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate({ name: form.name, email: form.email || null, notes: form.notes || null });
            }}
          >
            <Field label={t("name")} htmlFor="c-name">
              <input id="c-name" required minLength={2} disabled={!can("customers.write")} value={form.name}
                onChange={(e) => setDraft({ ...form, name: e.target.value })} className={inputCls} />
            </Field>
            <Field label={t("email")} htmlFor="c-email">
              <input id="c-email" type="email" disabled={!can("customers.write")} value={form.email}
                onChange={(e) => setDraft({ ...form, email: e.target.value })} className={inputCls} />
            </Field>
            <Field label={t("notes")} htmlFor="c-notes" hint={t("notesHint")}>
              <textarea id="c-notes" rows={4} disabled={!can("customers.write")} value={form.notes}
                onChange={(e) => setDraft({ ...form, notes: e.target.value })} className={`${inputCls} py-2`} />
            </Field>
            <ErrorBox error={save.error} />
            {save.isSuccess && !draft && <Notice>{t("saved")}</Notice>}
            {can("customers.write") && <Btn type="submit" variant="primary" disabled={!draft || save.isPending}>{t("save")}</Btn>}
          </form>
        </Card>
        <Card title={t("history", { count: c.bookings })} className="xl:col-span-2">
          <ul className="divide-y divide-line">
            {c.history.map((b) => (
              <li key={b.id}>
                <Link href={`/admin/bookings/${b.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:bg-surface">
                  <span className="w-28 tabular-nums">{formatDay(b.starts_at.slice(0, 10), "ru", { day: "numeric", month: "short", year: "numeric" })}</span>
                  <span className="font-medium text-accent">{b.reference}</span>
                  <span className="flex-1">{b.services.join(", ")}</span>
                  <span className="tabular-nums">{formatKzt(b.final_amount_kzt ?? b.total_kzt, "ru")}</span>
                  <StatusBadge status={b.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
