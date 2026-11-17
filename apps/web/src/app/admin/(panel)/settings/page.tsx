"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Btn, Card, cleanI18n, ErrorBox, Field, I18nInputs, inputCls, Loading, Notice, PageHeader } from "@/components/admin/ui";
import { api, type SiteSettings } from "@/lib/admin/api";
import { useAuth } from "@/lib/admin/auth";

type Policy = NonNullable<SiteSettings["booking"]>;
const POLICY: (keyof Policy)[] = ["slot_step_min", "buffer_min", "lead_time_min", "horizon_days", "cancel_cutoff_hours", "max_active_per_phone"];

export default function SettingsPage() {
  const t = useTranslations("Admin.settings");
  const { can } = useAuth();
  const write = can("settings.write");
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["settings"], queryFn: () => api<SiteSettings>("/admin/settings") });
  const [draft, setDraft] = useState<SiteSettings | null>(null);
  const save = useMutation({
    mutationFn: (s: SiteSettings) => api<SiteSettings>("/admin/settings", { method: "PUT", json: {
      ...s,
      address_i18n: cleanI18n(s.address_i18n), city_i18n: cleanI18n(s.city_i18n),
      seo_title_i18n: cleanI18n(s.seo_title_i18n), seo_description_i18n: cleanI18n(s.seo_description_i18n),
      whatsapp: s.whatsapp || null, telegram: s.telegram || null, email: s.email || null,
      instagram_url: s.instagram_url || null, logo_url: s.logo_url || null } }),
    onSuccess: (data) => { queryClient.setQueryData(["settings"], data); setDraft(null); },
  });

  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const s = draft ?? q.data;
  const set = (patch: Partial<SiteSettings>) => setDraft({ ...s, ...patch });
  const text = (key: "business_name" | "phone" | "whatsapp" | "telegram" | "email" | "instagram_url" | "logo_url", hint?: string) => (
    <Field label={t(`fields.${key}`)} htmlFor={`s-${key}`} hint={hint}>
      <input id={`s-${key}`} value={(s[key] as string | null) ?? ""} onChange={(e) => set({ [key]: e.target.value })} className={inputCls} />
    </Field>
  );

  return (
    <>
      <PageHeader title={t("title")} />
      {!write && <p className="mb-6 text-sm text-fg-muted">{t("readOnly")}</p>}
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(s); }}>
        <fieldset disabled={!write} className="grid gap-6 xl:grid-cols-2">
          <Card title={t("contacts")}>
            <div className="grid gap-4 sm:grid-cols-2">
              {text("business_name")}
              {text("phone", t("phoneHint"))}
              {text("whatsapp", t("phoneHint"))}
              {text("telegram", t("telegramHint"))}
              {text("email")}
              {text("instagram_url")}
            </div>
            <div className="mt-4 space-y-4">
              <I18nInputs id="s-address" label={t("fields.address")} value={s.address_i18n} onChange={(v) => set({ address_i18n: v as SiteSettings["address_i18n"] })} />
              <I18nInputs id="s-city" label={t("fields.city")} value={s.city_i18n} onChange={(v) => set({ city_i18n: v as SiteSettings["city_i18n"] })} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("fields.latitude")} htmlFor="s-lat"><input id="s-lat" type="number" step="any" value={s.latitude} onChange={(e) => set({ latitude: Number(e.target.value) })} className={inputCls} /></Field>
                <Field label={t("fields.longitude")} htmlFor="s-lng"><input id="s-lng" type="number" step="any" value={s.longitude} onChange={(e) => set({ longitude: Number(e.target.value) })} className={inputCls} /></Field>
              </div>
            </div>
          </Card>
          <div className="space-y-6">
            <Card title={t("brand")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("fields.accent_color")} htmlFor="s-accent">
                  <div className="flex gap-2">
                    <input id="s-accent" type="color" value={s.accent_color ?? "#C3A46C"} onChange={(e) => set({ accent_color: e.target.value.toUpperCase() })} className="h-10 w-14 border border-line bg-surface" />
                    <input aria-label={t("fields.accent_color")} value={s.accent_color ?? ""} onChange={(e) => set({ accent_color: e.target.value })} className={inputCls} />
                  </div>
                </Field>
                {text("logo_url")}
              </div>
              <div className="mt-4 space-y-4">
                <I18nInputs id="s-seo-title" label={t("fields.seo_title")} value={s.seo_title_i18n} onChange={(v) => set({ seo_title_i18n: v as SiteSettings["seo_title_i18n"] })} />
                <I18nInputs id="s-seo-desc" label={t("fields.seo_description")} multiline value={s.seo_description_i18n} onChange={(v) => set({ seo_description_i18n: v as SiteSettings["seo_description_i18n"] })} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!s.is_demo} onChange={(e) => set({ is_demo: e.target.checked })} className="size-4 accent-[var(--color-accent)]" />
                  {t("fields.is_demo")}
                </label>
              </div>
            </Card>
            <Card title={t("booking")}>
              <div className="grid gap-4 sm:grid-cols-2">
                {POLICY.map((key) => (
                  <Field key={key} label={t(`policy.${key}`)} htmlFor={`p-${key}`}>
                    <input id={`p-${key}`} type="number" min={0} value={s.booking?.[key] ?? ""}
                      onChange={(e) => set({ booking: { ...(s.booking as Policy), [key]: Number(e.target.value) } })} className={inputCls} />
                  </Field>
                ))}
              </div>
            </Card>
          </div>
        </fieldset>
        <div className="mt-6 flex items-center gap-3">
          {write && <Btn type="submit" variant="primary" disabled={!draft || save.isPending}>{t("save")}</Btn>}
          {save.isSuccess && !draft && <Notice>{t("saved")}</Notice>}
        </div>
        <div className="mt-3"><ErrorBox error={save.error} /></div>
      </form>
    </>
  );
}
