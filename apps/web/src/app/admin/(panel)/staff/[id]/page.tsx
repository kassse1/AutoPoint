"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Btn, Card, cleanI18n, ErrorBox, Field, I18nInputs, inputCls, Loading, Notice, PageHeader } from "@/components/admin/ui";
import { normalizeWeek, WeekEditor } from "@/components/admin/WeekEditor";
import { api, type AdminService, type Employee, type Interval, type User } from "@/lib/admin/api";
import { useAuth } from "@/lib/admin/auth";

export default function EmployeePage() {
  const t = useTranslations("Admin.staff");
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["employee", id], queryFn: () => api<Employee>(`/admin/employees/${id}`) });
  const services = useQuery({ queryKey: ["services"], queryFn: () => api<AdminService[]>("/admin/services") });
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<User[]>("/admin/users"), enabled: can("users.manage") });
  const [profile, setProfile] = useState<Employee | null>(null);
  const [skills, setSkills] = useState<number[] | null>(null);
  const [week, setWeek] = useState<Interval[] | null>(null);
  const onSaved = (e: Employee) => {
    queryClient.setQueryData(["employee", id], e);
    queryClient.invalidateQueries({ queryKey: ["employees"] });
  };
  const saveProfile = useMutation({
    mutationFn: (e: Employee) => api<Employee>(`/admin/employees/${id}`, { method: "PATCH", json: {
      display_name: e.display_name, position_i18n: cleanI18n(e.position_i18n), bio_i18n: Object.keys(cleanI18n(e.bio_i18n)).length ? cleanI18n(e.bio_i18n) : null,
      photo_url: e.photo_url || null, user_id: e.user_id || null, is_public: e.is_public, is_bookable: e.is_bookable,
      is_active: e.is_active, sort_order: e.sort_order } }),
    onSuccess: (e) => { onSaved(e); setProfile(null); },
  });
  const saveSkills = useMutation({
    mutationFn: (ids: number[]) => api<Employee>(`/admin/employees/${id}/services`, { method: "PUT", json: { service_ids: ids } }),
    onSuccess: (e) => { onSaved(e); setSkills(null); },
  });
  const saveWeek = useMutation({
    mutationFn: (w: Interval[]) => api<Employee>(`/admin/employees/${id}/schedule`, { method: "PUT", json: { intervals: normalizeWeek(w) } }),
    onSuccess: (e) => { onSaved(e); setWeek(null); },
  });

  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const e = profile ?? q.data;
  const chosen = skills ?? q.data.service_ids;
  const staffWrite = can("staff.write");

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/staff" className="text-fg-muted hover:text-fg">← {t("back")}</Link></p>
      <PageHeader title={q.data.display_name} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={t("profile")}>
          <form className="space-y-4" onSubmit={(ev) => { ev.preventDefault(); saveProfile.mutate(e); }}>
            <fieldset disabled={!staffWrite} className="space-y-4">
              <Field label={t("name")} htmlFor="e-name"><input id="e-name" required minLength={2} value={e.display_name} onChange={(ev) => setProfile({ ...e, display_name: ev.target.value })} className={inputCls} /></Field>
              <I18nInputs id="e-pos" label={t("position")} value={e.position_i18n} onChange={(v) => setProfile({ ...e, position_i18n: v as Employee["position_i18n"] })} />
              <I18nInputs id="e-bio" label={t("bio")} multiline value={e.bio_i18n} onChange={(v) => setProfile({ ...e, bio_i18n: v as Employee["bio_i18n"] })} />
              {can("users.manage") && (
                <Field label={t("login")} htmlFor="e-user" hint={t("loginHint")}>
                  <select id="e-user" value={e.user_id ?? ""} onChange={(ev) => setProfile({ ...e, user_id: ev.target.value || null })} className={inputCls}>
                    <option value="">{t("noLogin")}</option>
                    {users.data?.map((u) => <option key={u.id} value={u.id}>{u.full_name} · {u.email}</option>)}
                  </select>
                </Field>
              )}
              <div className="flex flex-wrap gap-6 text-sm">
                {(["is_bookable", "is_public", "is_active"] as const).map((flag) => (
                  <label key={flag} className="flex items-center gap-2">
                    <input type="checkbox" checked={e[flag]} onChange={(ev) => setProfile({ ...e, [flag]: ev.target.checked })} className="size-4 accent-[var(--color-accent)]" />
                    {t(`flags.${flag}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <ErrorBox error={saveProfile.error} />
            {saveProfile.isSuccess && !profile && <Notice>{t("saved")}</Notice>}
            {staffWrite && <Btn type="submit" variant="primary" disabled={!profile || saveProfile.isPending}>{t("save")}</Btn>}
          </form>
        </Card>

        <div className="space-y-6">
          <Card title={t("weekTitle")}>
            <p className="mb-3 text-xs text-fg-muted">{t("weekHint")}</p>
            <WeekEditor value={week ?? q.data.schedule} onChange={setWeek} disabled={!can("schedules.write")} />
            <div className="mt-4 flex items-center gap-3">
              {can("schedules.write") && <Btn variant="primary" disabled={!week || saveWeek.isPending} onClick={() => week && saveWeek.mutate(week)}>{t("saveWeek")}</Btn>}
              {saveWeek.isSuccess && !week && <Notice>{t("saved")}</Notice>}
            </div>
            <div className="mt-3"><ErrorBox error={saveWeek.error} /></div>
          </Card>

          <Card title={t("skillsTitle")}>
            <div className="flex flex-wrap gap-2">
              {services.data?.filter((s) => s.is_active).map((s) => {
                const on = chosen.includes(s.id);
                return (
                  <button key={s.id} type="button" aria-pressed={on} disabled={!staffWrite}
                    onClick={() => setSkills(on ? chosen.filter((x) => x !== s.id) : [...chosen, s.id])}
                    className="min-h-9 rounded-full border border-line px-3 text-xs text-fg-muted aria-pressed:border-accent aria-pressed:text-fg disabled:opacity-60">
                    {s.name_i18n.ru}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-3">
              {staffWrite && <Btn variant="primary" disabled={!skills || saveSkills.isPending} onClick={() => skills && saveSkills.mutate(skills)}>{t("saveSkills")}</Btn>}
              {saveSkills.isSuccess && !skills && <Notice>{t("saved")}</Notice>}
            </div>
            <div className="mt-3"><ErrorBox error={saveSkills.error} /></div>
          </Card>
        </div>
      </div>
    </>
  );
}
