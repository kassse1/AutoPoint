"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Btn, Card, cleanI18n, ErrorBox, Field, I18nInputs, inputCls, Loading, Notice, PageHeader } from "@/components/admin/ui";
import { api, type AdminCategory, type AdminOption, type AdminService, type PriceMatrix, type Vehicle } from "@/lib/admin/api";
import { useAuth } from "@/lib/admin/auth";
import { fromGrid, listToText, stepsToText, textToList, textToSteps, toGrid, type Grid } from "@/lib/admin/matrix";

const LOCALES = ["ru", "kk", "en"] as const;
type Lists = Record<(typeof LOCALES)[number], string>;

function emptyService(categoryId: number): AdminService {
  return {
    id: 0, category_id: categoryId, slug: "", name_i18n: { ru: "" }, summary_i18n: { ru: "" },
    description_i18n: { ru: "" }, includes_i18n: { ru: [] }, benefits_i18n: { ru: [] }, process_i18n: { ru: [] },
    image_url: null, price_display: "from", addon_eligible: false, is_featured: false, is_active: true, sort_order: 0,
  };
}

function ContentForm({ service, categories, canWrite }: { service: AdminService; categories: AdminCategory[]; canWrite: boolean }) {
  const t = useTranslations("Admin.serviceEditor");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [s, setS] = useState(service);
  const perLocale = (pick: (l: (typeof LOCALES)[number]) => string): Lists =>
    Object.fromEntries(LOCALES.map((l) => [l, pick(l)])) as Lists;
  const [includes, setIncludes] = useState(perLocale((l) => listToText(service.includes_i18n[l] ?? [])));
  const [benefits, setBenefits] = useState(perLocale((l) => listToText(service.benefits_i18n[l] ?? [])));
  const [process, setProcess] = useState(perLocale((l) => stepsToText(service.process_i18n[l] ?? [])));
  const isNew = service.id === 0;

  const toI18nList = (lists: Lists) => Object.fromEntries(Object.entries(lists).map(([l, v]) => [l, textToList(v)]).filter(([, v]) => v.length));
  const save = useMutation({
    mutationFn: () => {
      const body = {
        category_id: s.category_id, slug: s.slug, name_i18n: cleanI18n(s.name_i18n), summary_i18n: cleanI18n(s.summary_i18n),
        description_i18n: cleanI18n(s.description_i18n), includes_i18n: toI18nList(includes), benefits_i18n: toI18nList(benefits),
        process_i18n: Object.fromEntries(Object.entries(process).map(([l, v]) => [l, textToSteps(v)]).filter(([, v]) => v.length)),
        image_url: s.image_url || null, price_display: s.price_display, addon_eligible: s.addon_eligible,
        is_featured: s.is_featured, is_active: s.is_active, sort_order: s.sort_order,
      };
      return api<AdminService>(isNew ? "/admin/services" : `/admin/services/${s.id}`, { method: isNew ? "POST" : "PATCH", json: body });
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      if (isNew) router.replace(`/admin/services/${saved.id}`);
      else queryClient.setQueryData(["service", String(saved.id)], saved);
    },
  });

  const listArea = (id: string, label: string, hint: string, value: Lists, onChange: (v: Lists) => void) => (
    <fieldset>
      <legend className="mb-1.5 text-xs font-medium tracking-wide text-fg-muted uppercase">{label}</legend>
      <p className="mb-2 text-xs text-fg-muted">{hint}</p>
      <div className="grid gap-2 lg:grid-cols-3">
        {LOCALES.map((l) => (
          <textarea key={l} id={`${id}-${l}`} aria-label={`${label} (${l})`} rows={5} value={value[l]} required={l === "ru"}
            onChange={(e) => onChange({ ...value, [l]: e.target.value })} placeholder={l.toUpperCase()} className={`${inputCls} py-2`} />
        ))}
      </div>
    </fieldset>
  );

  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <fieldset disabled={!canWrite} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("category")} htmlFor="category">
            <select id="category" value={s.category_id} onChange={(e) => setS({ ...s, category_id: Number(e.target.value) })} className={inputCls}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name_i18n.ru}</option>)}
            </select>
          </Field>
          <Field label={t("slug")} htmlFor="slug" hint={t("slugHint")}>
            <input id="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={s.slug} onChange={(e) => setS({ ...s, slug: e.target.value })} className={inputCls} />
          </Field>
          <Field label={t("sort")} htmlFor="sort">
            <input id="sort" type="number" value={s.sort_order} onChange={(e) => setS({ ...s, sort_order: Number(e.target.value) })} className={inputCls} />
          </Field>
        </div>
        <I18nInputs id="name" label={t("name")} value={s.name_i18n} onChange={(v) => setS({ ...s, name_i18n: v as AdminService["name_i18n"] })} />
        <I18nInputs id="summary" label={t("summary")} value={s.summary_i18n} onChange={(v) => setS({ ...s, summary_i18n: v as AdminService["summary_i18n"] })} />
        <I18nInputs id="description" label={t("description")} multiline value={s.description_i18n} onChange={(v) => setS({ ...s, description_i18n: v as AdminService["description_i18n"] })} />
        {listArea("includes", t("includes"), t("linesHint"), includes, setIncludes)}
        {listArea("benefits", t("benefits"), t("linesHint"), benefits, setBenefits)}
        {listArea("process", t("process"), t("stepsHint"), process, setProcess)}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("image")} htmlFor="image" hint={t("imageHint")}>
            <input id="image" value={s.image_url ?? ""} onChange={(e) => setS({ ...s, image_url: e.target.value })} className={inputCls} />
          </Field>
          <Field label={t("priceDisplay")} htmlFor="display">
            <select id="display" value={s.price_display} onChange={(e) => setS({ ...s, price_display: e.target.value as "from" })} className={inputCls}>
              <option value="from">{t("displayFrom")}</option>
              <option value="fixed">{t("displayFixed")}</option>
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-6 text-sm">
          {(["is_active", "is_featured", "addon_eligible"] as const).map((flag) => (
            <label key={flag} className="flex items-center gap-2">
              <input type="checkbox" checked={s[flag]} onChange={(e) => setS({ ...s, [flag]: e.target.checked })} className="size-4 accent-[var(--color-accent)]" />
              {t(`flags.${flag}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <ErrorBox error={save.error} />
      {save.isSuccess && <Notice>{t("saved")}</Notice>}
      {canWrite && <Btn type="submit" variant="primary" disabled={save.isPending}>{isNew ? t("create") : t("save")}</Btn>}
    </form>
  );
}

function Options({ serviceId, canWrite }: { serviceId: number; canWrite: boolean }) {
  const t = useTranslations("Admin.serviceEditor");
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["options", serviceId], queryFn: () => api<AdminOption[]>(`/admin/services/${serviceId}/options`) });
  const [draft, setDraft] = useState({ code: "", group: "", name: "", isDefault: false });
  const done = () => {
    queryClient.invalidateQueries({ queryKey: ["options", serviceId] });
    queryClient.invalidateQueries({ queryKey: ["prices", serviceId] });
  };
  const add = useMutation({
    mutationFn: () => api(`/admin/services/${serviceId}/options`, { method: "POST", json: {
      code: draft.code, group_code: draft.group || null, name_i18n: { ru: draft.name }, is_default: draft.isDefault,
      sort_order: q.data?.length ?? 0 } }),
    onSuccess: () => { done(); setDraft({ code: "", group: "", name: "", isDefault: false }); },
  });
  const remove = useMutation({ mutationFn: (id: number) => api(`/admin/options/${id}`, { method: "DELETE" }), onSuccess: done });

  if (q.isPending) return <Loading />;
  return (
    <>
      <ul className="divide-y divide-line text-sm">
        {q.data?.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-3 py-2">
            <span>
              {o.name_i18n.ru} <span className="text-xs text-fg-muted">{o.code}{o.group_code ? ` · ${t("group")}: ${o.group_code}` : ""}{o.is_default ? ` · ${t("default")}` : ""}</span>
            </span>
            {canWrite && <Btn variant="danger" onClick={() => remove.mutate(o.id)} disabled={remove.isPending}>{t("delete")}</Btn>}
          </li>
        ))}
      </ul>
      {canWrite && (
        <form className="mt-4 grid gap-2 sm:grid-cols-5 sm:items-end" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
          <Field label={t("code")} htmlFor="o-code"><input id="o-code" required pattern="[a-z0-9_]+" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} className={inputCls} /></Field>
          <Field label={t("group")} htmlFor="o-group" hint={t("groupHint")}><input id="o-group" pattern="[a-z0-9_]*" value={draft.group} onChange={(e) => setDraft({ ...draft, group: e.target.value })} className={inputCls} /></Field>
          <Field label={t("nameRu")} htmlFor="o-name"><input id="o-name" required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} /></Field>
          <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={draft.isDefault} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} className="size-4 accent-[var(--color-accent)]" />{t("default")}</label>
          <Btn type="submit" disabled={add.isPending}>{t("addOption")}</Btn>
        </form>
      )}
      <div className="mt-3"><ErrorBox error={add.error ?? remove.error} /></div>
    </>
  );
}

function Prices({ serviceId, canWrite }: { serviceId: number; canWrite: boolean }) {
  const t = useTranslations("Admin.serviceEditor");
  const queryClient = useQueryClient();
  const matrix = useQuery({ queryKey: ["prices", serviceId], queryFn: () => api<PriceMatrix>(`/admin/services/${serviceId}/prices`) });
  const options = useQuery({ queryKey: ["options", serviceId], queryFn: () => api<AdminOption[]>(`/admin/services/${serviceId}/options`) });
  const vehicles = useQuery({ queryKey: ["vehicle-categories"], queryFn: () => api<Vehicle[]>("/admin/vehicle-categories") });
  const [grid, setGrid] = useState<Grid | null>(null);
  const save = useMutation({
    mutationFn: (g: Grid) => api<PriceMatrix>(`/admin/services/${serviceId}/prices`, { method: "PUT", json: fromGrid(g) }),
    onSuccess: (data) => { queryClient.setQueryData(["prices", serviceId], data); setGrid(null); },
  });
  if (!matrix.data || !options.data || !vehicles.data) return <Loading />;
  const rows = ["", ...options.data.map((o) => o.code)];
  const cols = vehicles.data.filter((v) => v.is_active);
  const current = grid ?? toGrid(matrix.data, rows, cols.map((v) => v.code));
  const rowName = (code: string) => (code === "" ? t("base") : options.data.find((o) => o.code === code)?.name_i18n.ru);
  const setCell = (row: string, col: string, key: "price" | "minutes", value: string) =>
    setGrid({ ...current, [row]: { ...current[row], [col]: { ...current[row][col], [key]: value } } });

  return (
    <>
      <p className="mb-3 text-xs text-fg-muted">{t("pricesHint")}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-xs tracking-wide text-fg-muted uppercase">
            <tr>
              <th scope="col" className="px-2 py-2 text-left font-medium">{t("row")}</th>
              {cols.map((v) => <th key={v.code} scope="col" className="px-2 py-2 text-left font-medium">{v.name_i18n.ru}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row || "base"}>
                <th scope="row" className="px-2 py-2 text-left font-normal">{rowName(row)}</th>
                {cols.map((v) => (
                  <td key={v.code} className="px-2 py-2">
                    <div className="flex gap-1">
                      <input type="number" min={0} step={500} disabled={!canWrite} aria-label={`${rowName(row)}, ${v.name_i18n.ru}: ${t("priceKzt")}`}
                        value={current[row][v.code].price} onChange={(e) => setCell(row, v.code, "price", e.target.value)} className={`${inputCls} w-24 tabular-nums`} placeholder="₸" />
                      <input type="number" min={0} step={15} disabled={!canWrite} aria-label={`${rowName(row)}, ${v.name_i18n.ru}: ${t("minutes")}`}
                        value={current[row][v.code].minutes} onChange={(e) => setCell(row, v.code, "minutes", e.target.value)} className={`${inputCls} w-20 tabular-nums`} placeholder={t("min")} />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center gap-3">
        {canWrite && <Btn variant="primary" disabled={!grid || save.isPending} onClick={() => grid && save.mutate(grid)}>{t("savePrices")}</Btn>}
        {save.isSuccess && !grid && <Notice>{t("pricesSaved")}</Notice>}
      </div>
      <div className="mt-3"><ErrorBox error={save.error} /></div>
    </>
  );
}

export default function ServiceEditorPage() {
  const t = useTranslations("Admin.serviceEditor");
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const isNew = id === "new";
  const service = useQuery({ queryKey: ["service", id], queryFn: () => api<AdminService>(`/admin/services/${id}`), enabled: !isNew });
  const categories = useQuery({ queryKey: ["service-categories"], queryFn: () => api<AdminCategory[]>("/admin/service-categories") });
  if ((!isNew && service.isPending) || categories.isPending) return <Loading />;
  if (service.error || categories.error) return <ErrorBox error={service.error ?? categories.error} />;
  const data = isNew ? emptyService(categories.data![0]?.id ?? 0) : service.data!;
  const write = can("catalog.write");

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/services" className="text-fg-muted hover:text-fg">← {t("back")}</Link></p>
      <PageHeader title={isNew ? t("newTitle") : data.name_i18n.ru} />
      <div className="space-y-6">
        <Card title={t("content")}><ContentForm key={data.id} service={data} categories={categories.data!} canWrite={write} /></Card>
        {!isNew && <Card title={t("options")}><Options serviceId={data.id} canWrite={write} /></Card>}
        {!isNew && <Card title={t("prices")}><Prices serviceId={data.id} canWrite={write} /></Card>}
      </div>
    </>
  );
}
