"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Btn, Card, Empty, ErrorBox, Field, inputCls, Loading, PageHeader } from "@/components/admin/ui";
import { api, type AdminService, type Discount } from "@/lib/admin/api";
import { useAuth } from "@/lib/admin/auth";
import { formatKzt } from "@/lib/format";

const blank = { kind: "bundle" as "bundle" | "min_services", name: "", percent: "10", minServices: "3", slugs: [] as string[], from: "", to: "" };

export default function DiscountsPage() {
  const t = useTranslations("Admin.discounts");
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const rules = useQuery({ queryKey: ["discounts"], queryFn: () => api<Discount[]>("/admin/discount-rules") });
  const services = useQuery({ queryKey: ["services"], queryFn: () => api<AdminService[]>("/admin/services") });
  const [draft, setDraft] = useState(blank);
  const done = () => queryClient.invalidateQueries({ queryKey: ["discounts"] });
  const create = useMutation({
    mutationFn: () => api("/admin/discount-rules", { method: "POST", json: {
      kind: draft.kind, name_i18n: { ru: draft.name }, percent: Number(draft.percent),
      min_services: draft.kind === "min_services" ? Number(draft.minServices) : null,
      service_slugs: draft.kind === "bundle" ? draft.slugs : [], valid_from: draft.from || null, valid_to: draft.to || null } }),
    onSuccess: () => { done(); setDraft(blank); },
  });
  const toggle = useMutation({
    mutationFn: (r: Discount) => api(`/admin/discount-rules/${r.id}`, { method: "PUT", json: { ...r, id: undefined, is_active: !r.is_active } }),
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: (id: number) => api(`/admin/discount-rules/${id}`, { method: "DELETE" }), onSuccess: done });
  const write = can("catalog.write");
  const names = new Map(services.data?.map((s) => [s.slug, s.name_i18n.ru]));

  return (
    <>
      <PageHeader title={t("title")} />
      <p className="mb-6 max-w-2xl text-sm text-fg-muted">{t("lead")}</p>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={t("list")}>
          {rules.isPending ? <Loading /> : !rules.data?.length ? <Empty text={t("empty")} /> : (
            <ul className="divide-y divide-line text-sm">
              {rules.data.map((r) => (
                <li key={r.id} className={`flex flex-wrap items-center justify-between gap-3 py-3 ${r.is_active ? "" : "text-fg-muted"}`}>
                  <span>
                    <span className="font-medium">{r.name_i18n.ru}</span> — {r.percent ? `${r.percent}%` : formatKzt(r.amount_kzt ?? 0, "ru")}
                    <span className="block text-xs text-fg-muted">
                      {r.kind === "bundle" ? r.service_slugs.map((s) => names.get(s) ?? s).join(" + ") : t("minServicesText", { count: r.min_services ?? 0 })}
                      {(r.valid_from || r.valid_to) && ` · ${r.valid_from ?? "…"} — ${r.valid_to ?? "…"}`}
                    </span>
                  </span>
                  {write && (
                    <span className="flex gap-2">
                      <Btn onClick={() => toggle.mutate(r)}>{r.is_active ? t("disable") : t("enable")}</Btn>
                      <Btn variant="danger" onClick={() => remove.mutate(r.id)}>{t("delete")}</Btn>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3"><ErrorBox error={toggle.error ?? remove.error ?? rules.error} /></div>
        </Card>
        {write && (
          <Card title={t("new")}>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("name")} htmlFor="d-name"><input id="d-name" required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} /></Field>
                <Field label={t("kind")} htmlFor="d-kind">
                  <select id="d-kind" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as "bundle" })} className={inputCls}>
                    <option value="bundle">{t("bundle")}</option>
                    <option value="min_services">{t("minServices")}</option>
                  </select>
                </Field>
                <Field label={t("percent")} htmlFor="d-pct"><input id="d-pct" type="number" min={1} max={90} required value={draft.percent} onChange={(e) => setDraft({ ...draft, percent: e.target.value })} className={inputCls} /></Field>
                {draft.kind === "min_services" && (
                  <Field label={t("minCount")} htmlFor="d-min"><input id="d-min" type="number" min={2} max={10} required value={draft.minServices} onChange={(e) => setDraft({ ...draft, minServices: e.target.value })} className={inputCls} /></Field>
                )}
                <Field label={t("from")} htmlFor="d-from"><input id="d-from" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className={inputCls} /></Field>
                <Field label={t("to")} htmlFor="d-to"><input id="d-to" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className={inputCls} /></Field>
              </div>
              {draft.kind === "bundle" && (
                <fieldset>
                  <legend className="mb-2 text-xs font-medium tracking-wide text-fg-muted uppercase">{t("services")}</legend>
                  <div className="flex flex-wrap gap-2">
                    {services.data?.filter((s) => s.is_active).map((s) => {
                      const on = draft.slugs.includes(s.slug);
                      return (
                        <button key={s.slug} type="button" aria-pressed={on}
                          onClick={() => setDraft({ ...draft, slugs: on ? draft.slugs.filter((x) => x !== s.slug) : [...draft.slugs, s.slug] })}
                          className="min-h-9 rounded-full border border-line px-3 text-xs text-fg-muted aria-pressed:border-accent aria-pressed:text-fg">
                          {s.name_i18n.ru}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}
              <ErrorBox error={create.error} />
              <Btn type="submit" variant="primary" disabled={create.isPending}>{t("create")}</Btn>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
