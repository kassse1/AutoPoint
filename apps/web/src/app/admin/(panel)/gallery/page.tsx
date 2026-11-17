"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { Btn, Card, cleanI18n, Empty, ErrorBox, Field, I18nInputs, inputCls, Loading, PageHeader } from "@/components/admin/ui";
import { api, type AdminCategory, type AdminService, type GalleryInput, type GalleryItem } from "@/lib/admin/api";

type Draft = Omit<GalleryInput, "image_url"> & { id?: number; image_url: string | null };
const blank: Draft = { kind: "before_after", image_url: null, before_image_url: null, alt_i18n: { ru: "" }, caption_i18n: null, is_published: true, sort_order: 0, category_id: null, service_id: null };

export default function GalleryAdminPage() {
  const t = useTranslations("Admin.gallery");
  const queryClient = useQueryClient();
  const items = useQuery({ queryKey: ["gallery"], queryFn: () => api<GalleryItem[]>("/admin/gallery") });
  const services = useQuery({ queryKey: ["services"], queryFn: () => api<AdminService[]>("/admin/services") });
  const categories = useQuery({ queryKey: ["service-categories"], queryFn: () => api<AdminCategory[]>("/admin/service-categories") });
  const [draft, setDraft] = useState<Draft | null>(null);
  const done = () => { queryClient.invalidateQueries({ queryKey: ["gallery"] }); setDraft(null); };
  const save = useMutation({
    mutationFn: (d: Draft) => {
      const { id, ...body } = d;
      const json = { ...body, alt_i18n: cleanI18n(body.alt_i18n), caption_i18n: Object.keys(cleanI18n(body.caption_i18n)).length ? cleanI18n(body.caption_i18n) : null,
        before_image_url: body.kind === "before_after" ? body.before_image_url : null };
      return api(id ? `/admin/gallery/${id}` : "/admin/gallery", { method: id ? "PUT" : "POST", json });
    },
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: (id: number) => api(`/admin/gallery/${id}`, { method: "DELETE" }), onSuccess: done });
  const togglePublish = useMutation({
    mutationFn: (g: GalleryItem) => api(`/admin/gallery/${g.id}`, { method: "PUT", json: {
      kind: g.kind, category_id: g.category_id, service_id: g.service_id, image_url: g.image_url, before_image_url: g.before_image_url,
      width: g.width, height: g.height, alt_i18n: g.alt_i18n, caption_i18n: g.caption_i18n, is_published: !g.is_published, sort_order: g.sort_order } }),
    onSuccess: done,
  });

  return (
    <>
      <PageHeader title={t("title")}>
        <Btn variant="primary" onClick={() => setDraft(blank)}>{t("add")}</Btn>
      </PageHeader>
      <p className="mb-6 max-w-2xl text-sm text-fg-muted">{t("lead")}</p>

      {draft && (
        <Card title={draft.id ? t("edit") : t("add")} className="mb-6">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(draft); }}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("kind")} htmlFor="g-kind">
                <select id="g-kind" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft["kind"] })} className={inputCls}>
                  {(["before_after", "work", "studio"] as const).map((k) => <option key={k} value={k}>{t(`kinds.${k}`)}</option>)}
                </select>
              </Field>
              <Field label={t("service")} htmlFor="g-service">
                <select id="g-service" value={draft.service_id ?? ""} className={inputCls} onChange={(e) => {
                  const service = services.data?.find((s) => s.id === Number(e.target.value));
                  setDraft({ ...draft, service_id: service?.id ?? null, category_id: service?.category_id ?? draft.category_id });
                }}>
                  <option value="">—</option>
                  {services.data?.map((s) => <option key={s.id} value={s.id}>{s.name_i18n.ru}</option>)}
                </select>
              </Field>
              <Field label={t("category")} htmlFor="g-category">
                <select id="g-category" value={draft.category_id ?? ""} onChange={(e) => setDraft({ ...draft, category_id: e.target.value ? Number(e.target.value) : null })} className={inputCls}>
                  <option value="">—</option>
                  {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name_i18n.ru}</option>)}
                </select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-8">
              {draft.kind === "before_after" && (
                <ImageUpload label={t("before")} value={draft.before_image_url} onChange={(url) => setDraft({ ...draft, before_image_url: url })} />
              )}
              <ImageUpload label={draft.kind === "before_after" ? t("after") : t("photo")} value={draft.image_url}
                onChange={(url, size) => setDraft({ ...draft, image_url: url, width: size?.width ?? null, height: size?.height ?? null })} />
            </div>
            <I18nInputs id="g-alt" label={t("alt")} value={draft.alt_i18n} onChange={(v) => setDraft({ ...draft, alt_i18n: v as Draft["alt_i18n"] })} />
            <I18nInputs id="g-caption" required={false} label={t("caption")} value={draft.caption_i18n} onChange={(v) => setDraft({ ...draft, caption_i18n: v as Draft["alt_i18n"] })} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.is_published} onChange={(e) => setDraft({ ...draft, is_published: e.target.checked })} className="size-4 accent-[var(--color-accent)]" />
              {t("published")}
            </label>
            <ErrorBox error={save.error} />
            <div className="flex gap-2">
              <Btn type="submit" variant="primary" disabled={save.isPending || !draft.image_url || (draft.kind === "before_after" && !draft.before_image_url)}>{t("save")}</Btn>
              <Btn onClick={() => setDraft(null)}>{t("cancel")}</Btn>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {items.isPending ? <Loading /> : items.error ? <ErrorBox error={items.error} /> : !items.data.length ? <Empty text={t("empty")} /> : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.data.map((g) => (
              <li key={g.id} className={`border border-line p-3 ${g.is_published ? "" : "opacity-60"}`}>
                <div className="flex gap-2">
                  {[g.before_image_url, g.image_url].filter((u) => g.kind === "before_after" || u === g.image_url).map((url, i) => (
                    url
                      // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
                      ? <img key={i} src={url} alt="" className="h-24 flex-1 object-cover" />
                      : <span key={i} className="grid h-24 flex-1 place-items-center bg-surface text-xs text-fg-muted">{t("noPhoto")}</span>
                  ))}
                </div>
                <p className="mt-2 text-sm">{String(g.alt_i18n.ru ?? "")}</p>
                <p className="text-xs text-fg-muted">{t(`kinds.${g.kind as "work"}`)}{g.is_demo ? ` · ${t("demo")}` : ""}{g.is_published ? "" : ` · ${t("hidden")}`}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Btn onClick={() => setDraft({ ...g, alt_i18n: g.alt_i18n as Draft["alt_i18n"], caption_i18n: g.caption_i18n as Draft["caption_i18n"], kind: g.kind as Draft["kind"] })}>{g.is_demo ? t("replacePhotos") : t("edit")}</Btn>
                  {!g.is_demo && <Btn onClick={() => togglePublish.mutate(g)}>{g.is_published ? t("hide") : t("show")}</Btn>}
                  <Btn variant="danger" onClick={() => remove.mutate(g.id)}>{t("delete")}</Btn>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3"><ErrorBox error={remove.error ?? togglePublish.error} /></div>
      </Card>
    </>
  );
}
