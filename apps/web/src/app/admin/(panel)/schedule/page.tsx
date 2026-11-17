"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Btn, Card, Empty, ErrorBox, Field, inputCls, Loading, Notice, PageHeader } from "@/components/admin/ui";
import { normalizeWeek, WeekEditor } from "@/components/admin/WeekEditor";
import { api, type Employee, type Interval, type ScheduleException } from "@/lib/admin/api";
import { useAuth } from "@/lib/admin/auth";
import { formatDay } from "@/lib/booking";

export default function SchedulePage() {
  const t = useTranslations("Admin.schedule");
  const { can } = useAuth();
  const write = can("schedules.write");
  const queryClient = useQueryClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(new Date());
  const hours = useQuery({ queryKey: ["business-hours"], queryFn: () => api<Interval[]>("/admin/business-hours") });
  const employees = useQuery({ queryKey: ["employees"], queryFn: () => api<Employee[]>("/admin/employees") });
  const exceptions = useQuery({ queryKey: ["exceptions"], queryFn: () => api<ScheduleException[]>(`/admin/schedule-exceptions?date_from=${today}`) });
  const [week, setWeek] = useState<Interval[] | null>(null);
  const [draft, setDraft] = useState({ day: "", employee: "", closed: true, opens: "10:00", closes: "16:00", reason: "" });

  const saveHours = useMutation({
    mutationFn: (w: Interval[]) => api<Interval[]>("/admin/business-hours", { method: "PUT", json: { intervals: normalizeWeek(w) } }),
    onSuccess: (data) => { queryClient.setQueryData(["business-hours"], data); setWeek(null); },
  });
  const addException = useMutation({
    mutationFn: () => api("/admin/schedule-exceptions", { method: "POST", json: {
      day: draft.day, employee_id: draft.employee ? Number(draft.employee) : null, is_closed: draft.closed,
      opens: draft.closed ? null : draft.opens, closes: draft.closed ? null : draft.closes, reason: draft.reason || null } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["exceptions"] }); setDraft({ ...draft, day: "", reason: "" }); },
  });
  const removeException = useMutation({
    mutationFn: (id: number) => api(`/admin/schedule-exceptions/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exceptions"] }),
  });
  const employeeName = new Map(employees.data?.map((e) => [e.id, e.display_name]));

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={t("hours")}>
          <p className="mb-3 text-xs text-fg-muted">{t("hoursHint")}</p>
          {hours.isPending ? <Loading /> : (
            <WeekEditor value={week ?? hours.data ?? []} onChange={setWeek} disabled={!write} singlePerDay />
          )}
          <div className="mt-4 flex items-center gap-3">
            {write && <Btn variant="primary" disabled={!week || saveHours.isPending} onClick={() => week && saveHours.mutate(week)}>{t("save")}</Btn>}
            {saveHours.isSuccess && !week && <Notice>{t("saved")}</Notice>}
          </div>
          <div className="mt-3"><ErrorBox error={saveHours.error ?? hours.error} /></div>
        </Card>

        <Card title={t("exceptions")}>
          <p className="mb-3 text-xs text-fg-muted">{t("exceptionsHint")}</p>
          {exceptions.isPending ? <Loading /> : !exceptions.data?.length ? <Empty text={t("noExceptions")} /> : (
            <ul className="divide-y divide-line text-sm">
              {exceptions.data.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <span>
                    <span className="font-medium">{formatDay(x.day, "ru", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</span>
                    {" · "}{x.employee_id ? employeeName.get(x.employee_id) : t("wholeStudio")}
                    {" · "}{x.is_closed ? t("closed") : `${x.opens?.slice(0, 5)}–${x.closes?.slice(0, 5)}`}
                    {x.reason && <span className="block text-xs text-fg-muted">{x.reason}</span>}
                  </span>
                  {write && <Btn variant="danger" onClick={() => removeException.mutate(x.id)}>{t("remove")}</Btn>}
                </li>
              ))}
            </ul>
          )}
          {write && (
            <form className="mt-6 grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); addException.mutate(); }}>
              <Field label={t("day")} htmlFor="x-day"><input id="x-day" type="date" required min={today} value={draft.day} onChange={(e) => setDraft({ ...draft, day: e.target.value })} className={inputCls} /></Field>
              <Field label={t("who")} htmlFor="x-who">
                <select id="x-who" value={draft.employee} onChange={(e) => setDraft({ ...draft, employee: e.target.value })} className={inputCls}>
                  <option value="">{t("wholeStudio")}</option>
                  {employees.data?.filter((e) => e.is_bookable).map((e) => <option key={e.id} value={e.id}>{e.display_name}</option>)}
                </select>
              </Field>
              <label className="flex min-h-10 items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={draft.closed} onChange={(e) => setDraft({ ...draft, closed: e.target.checked })} className="size-4 accent-[var(--color-accent)]" />
                {t("closedAllDay")}
              </label>
              {!draft.closed && (
                <>
                  <Field label={t("opens")} htmlFor="x-open"><input id="x-open" type="time" required value={draft.opens} onChange={(e) => setDraft({ ...draft, opens: e.target.value })} className={inputCls} /></Field>
                  <Field label={t("closes")} htmlFor="x-close"><input id="x-close" type="time" required value={draft.closes} onChange={(e) => setDraft({ ...draft, closes: e.target.value })} className={inputCls} /></Field>
                </>
              )}
              <Field label={t("reason")} htmlFor="x-reason" className="sm:col-span-2"><input id="x-reason" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} className={inputCls} /></Field>
              <div className="sm:col-span-2"><Btn type="submit" variant="primary" disabled={addException.isPending}>{t("add")}</Btn></div>
            </form>
          )}
          <div className="mt-3"><ErrorBox error={addException.error ?? removeException.error ?? exceptions.error} /></div>
        </Card>
      </div>
    </>
  );
}
