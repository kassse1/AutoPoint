"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Btn, Card, Empty, ErrorBox, Field, inputCls, Loading, PageHeader } from "@/components/admin/ui";
import { api, type AdminReview } from "@/lib/admin/api";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(new Date());
const blank = { author_name: "", vehicle: "", rating: "5", body: "", locale: "ru", source: "manual", source_url: "", review_date: today(), is_published: true };

export default function ReviewsAdminPage() {
  const t = useTranslations("Admin.reviews");
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["reviews"], queryFn: () => api<AdminReview[]>("/admin/reviews") });
  const [draft, setDraft] = useState(blank);
  const done = () => queryClient.invalidateQueries({ queryKey: ["reviews"] });
  const create = useMutation({
    mutationFn: () => api("/admin/reviews", { method: "POST", json: {
      ...draft, vehicle: draft.vehicle || null, rating: draft.rating ? Number(draft.rating) : null, source_url: draft.source_url || null } }),
    onSuccess: () => { done(); setDraft({ ...blank, review_date: today() }); },
  });
  const toggle = useMutation({
    mutationFn: (r: AdminReview) => api(`/admin/reviews/${r.id}`, { method: "PUT", json: {
      author_name: r.author_name, vehicle: r.vehicle, rating: r.rating, body: r.body, locale: r.locale, source: r.source,
      source_url: r.source_url, review_date: r.review_date, is_published: !r.is_published } }),
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: (id: number) => api(`/admin/reviews/${id}`, { method: "DELETE" }), onSuccess: done });

  return (
    <>
      <PageHeader title={t("title")} />
      <p className="mb-6 max-w-2xl text-sm text-fg-muted">{t("lead")}</p>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          {q.isPending ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : !q.data.length ? <Empty text={t("empty")} /> : (
            <ul className="divide-y divide-line">
              {q.data.map((r) => (
                <li key={r.id} className={`py-4 ${r.is_published ? "" : "opacity-60"}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">
                      {r.author_name}{r.vehicle && <span className="text-fg-muted"> · {r.vehicle}</span>}
                      {r.rating && <span className="ml-2 text-accent" aria-label={t("rating", { rating: r.rating })}>{"★".repeat(r.rating)}</span>}
                    </p>
                    <p className="text-xs text-fg-muted">
                      {r.review_date} · {t(`sources.${r.source as "manual"}`)}{r.is_demo ? ` · ${t("demo")}` : ""}
                    </p>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed">{r.body}</p>
                  <div className="mt-3 flex gap-2">
                    {!r.is_demo && <Btn onClick={() => toggle.mutate(r)}>{r.is_published ? t("hide") : t("show")}</Btn>}
                    <Btn variant="danger" onClick={() => remove.mutate(r.id)}>{t("delete")}</Btn>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3"><ErrorBox error={toggle.error ?? remove.error} /></div>
        </Card>
        <Card title={t("add")}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <Field label={t("author")} htmlFor="r-author"><input id="r-author" required value={draft.author_name} onChange={(e) => setDraft({ ...draft, author_name: e.target.value })} className={inputCls} /></Field>
            <Field label={t("vehicle")} htmlFor="r-vehicle"><input id="r-vehicle" value={draft.vehicle} onChange={(e) => setDraft({ ...draft, vehicle: e.target.value })} className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t("ratingLabel")} htmlFor="r-rating">
                <select id="r-rating" value={draft.rating} onChange={(e) => setDraft({ ...draft, rating: e.target.value })} className={inputCls}>
                  <option value="">—</option>
                  {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
              <Field label={t("date")} htmlFor="r-date"><input id="r-date" type="date" required value={draft.review_date} onChange={(e) => setDraft({ ...draft, review_date: e.target.value })} className={inputCls} /></Field>
              <Field label={t("language")} htmlFor="r-locale">
                <select id="r-locale" value={draft.locale} onChange={(e) => setDraft({ ...draft, locale: e.target.value })} className={inputCls}>
                  {["ru", "kk", "en"].map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </Field>
              <Field label={t("source")} htmlFor="r-source">
                <select id="r-source" value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} className={inputCls}>
                  {(["manual", "google", "2gis", "yandex"] as const).map((s) => <option key={s} value={s}>{t(`sources.${s}`)}</option>)}
                </select>
              </Field>
            </div>
            <Field label={t("link")} htmlFor="r-url" hint={t("linkHint")}><input id="r-url" type="url" pattern="https://.*" value={draft.source_url} onChange={(e) => setDraft({ ...draft, source_url: e.target.value })} className={inputCls} /></Field>
            <Field label={t("text")} htmlFor="r-body"><textarea id="r-body" required minLength={5} rows={4} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} className={`${inputCls} py-2`} /></Field>
            <p className="text-xs text-warning">{t("honesty")}</p>
            <ErrorBox error={create.error} />
            <Btn type="submit" variant="primary" disabled={create.isPending}>{t("save")}</Btn>
          </form>
        </Card>
      </div>
    </>
  );
}
