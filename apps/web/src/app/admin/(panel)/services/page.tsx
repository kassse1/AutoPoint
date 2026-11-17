"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Btn, Card, ErrorBox, Field, inputCls, Loading, PageHeader } from "@/components/admin/ui";
import { api, type AdminCategory, type AdminService, type Vehicle } from "@/lib/admin/api";
import { useAuth } from "@/lib/admin/auth";

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  const t = useTranslations("Admin");
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={onClick}
      className="min-h-8 rounded-full border border-line px-3 text-xs aria-checked:border-success aria-checked:text-success disabled:opacity-40">
      {on ? t("active") : t("inactive")}
    </button>
  );
}

/** Small list editor shared by categories and vehicle classes: add with slug/code + ru name. */
function SimpleList<T extends { id: number; name_i18n: Record<string, string>; is_active: boolean }>({
  title, path, keyField, rows, canWrite,
}: { title: string; path: string; keyField: "slug" | "code"; rows: T[]; canWrite: boolean }) {
  const t = useTranslations("Admin.services");
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({ key: "", name: "" });
  const mutation = useMutation({
    mutationFn: ({ id, json }: { id?: number; json: object }) =>
      api(`/admin/${path}${id ? `/${id}` : ""}`, { method: id ? "PATCH" : "POST", json }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [path] });
      setDraft({ key: "", name: "" });
    },
  });
  return (
    <Card title={title}>
      <ul className="divide-y divide-line text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-2">
            <span>
              {r.name_i18n.ru} <span className="text-xs text-fg-muted">{(r as unknown as Record<string, string>)[keyField]}</span>
            </span>
            <Toggle on={r.is_active} disabled={!canWrite} onClick={() => mutation.mutate({ id: r.id, json: { is_active: !r.is_active } })} />
          </li>
        ))}
      </ul>
      {canWrite && (
        <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate({ json: { [keyField]: draft.key, name_i18n: { ru: draft.name }, sort_order: rows.length } });
        }}>
          <Field label={keyField} htmlFor={`${path}-key`}>
            <input id={`${path}-key`} required pattern={keyField === "slug" ? "[a-z0-9]+(-[a-z0-9]+)*" : "[a-z0-9_]+"} value={draft.key}
              onChange={(e) => setDraft({ ...draft, key: e.target.value })} className={`${inputCls} w-36`} />
          </Field>
          <Field label={t("nameRu")} htmlFor={`${path}-name`}>
            <input id={`${path}-name`} required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${inputCls} w-48`} />
          </Field>
          <Btn type="submit" disabled={mutation.isPending}>{t("add")}</Btn>
        </form>
      )}
      <div className="mt-3"><ErrorBox error={mutation.error} /></div>
    </Card>
  );
}

export default function ServicesPage() {
  const t = useTranslations("Admin.services");
  const { can } = useAuth();
  const services = useQuery({ queryKey: ["services"], queryFn: () => api<AdminService[]>("/admin/services") });
  const categories = useQuery({ queryKey: ["service-categories"], queryFn: () => api<AdminCategory[]>("/admin/service-categories") });
  const vehicles = useQuery({ queryKey: ["vehicle-categories"], queryFn: () => api<Vehicle[]>("/admin/vehicle-categories") });
  const categoryName = new Map(categories.data?.map((c) => [c.id, c.name_i18n.ru]));
  const write = can("catalog.write");

  return (
    <>
      <PageHeader title={t("title")}>
        {write && (
          <Link href="/admin/services/new" className="inline-flex min-h-10 items-center border border-accent px-4 text-sm font-semibold text-accent hover:bg-accent hover:text-accent-fg">
            {t("new")}
          </Link>
        )}
      </PageHeader>
      {!write && <p className="mb-6 text-sm text-fg-muted">{t("readOnly")}</p>}
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          {services.isPending ? <Loading /> : services.error ? <ErrorBox error={services.error} /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="text-xs tracking-wide text-fg-muted uppercase">
                  <tr className="border-b border-line">
                    <th scope="col" className="px-2 py-2 font-medium">{t("service")}</th>
                    <th scope="col" className="px-2 py-2 font-medium">{t("category")}</th>
                    <th scope="col" className="px-2 py-2 font-medium">{t("flags")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {services.data.map((s) => (
                    <tr key={s.id} className={s.is_active ? "" : "text-fg-muted"}>
                      <td className="px-2 py-2">
                        <Link href={`/admin/services/${s.id}`} className="font-medium text-accent hover:underline">{s.name_i18n.ru}</Link>
                        <span className="block text-xs text-fg-muted">/{s.slug}</span>
                      </td>
                      <td className="px-2 py-2">{categoryName.get(s.category_id)}</td>
                      <td className="px-2 py-2 text-xs">
                        {[!s.is_active && t("archived"), s.is_featured && t("featured"), s.addon_eligible && t("addon")].filter(Boolean).join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="space-y-6">
          {categories.data && <SimpleList title={t("categories")} path="service-categories" keyField="slug" rows={categories.data} canWrite={write} />}
          {vehicles.data && <SimpleList title={t("vehicles")} path="vehicle-categories" keyField="code" rows={vehicles.data} canWrite={write} />}
        </div>
      </div>
    </>
  );
}
