"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Btn, Card, Dialog, ErrorBox, Field, inputCls, Loading, Notice, PageHeader, StatusBadge } from "@/components/admin/ui";
import { PriceLines } from "@/components/admin/PriceLines";
import { almatyIso, api, localDate, localTime, type BookingDetail, type Employee } from "@/lib/admin/api";
import { useAuth } from "@/lib/admin/auth";
import { nextStatuses } from "@/lib/admin/status";
import { formatDay } from "@/lib/booking";
import { phoneDisplay, telHref, whatsappHref } from "@/lib/format";

type Pending = { status: string; needsAmount: boolean; needsReason: boolean } | null;

export default function BookingDetailPage() {
  const t = useTranslations("Admin.booking");
  const ts = useTranslations("Admin.status");
  const { id } = useParams<{ id: string }>();
  const { can, me } = useAuth();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["booking", id], queryFn: () => api<BookingDetail>(`/admin/bookings/${id}`) });
  const employees = useQuery({ queryKey: ["employees"], queryFn: () => api<Employee[]>("/admin/employees"), enabled: can("staff.read") });

  const [dialog, setDialog] = useState<Pending>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState<string | null>(null);
  const [move, setMove] = useState<{ date: string; time: string; employee: string } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ path, json }: { path: string; json: unknown }) =>
      api<BookingDetail>(`/admin/bookings/${id}${path}`, { method: path ? "POST" : "PATCH", json }),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(["booking", id], data);
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      setDialog(null);
      setMove(null);
      setNotes(null);
      setSaved(vars.path === "" ? t("notesSaved") : t("saved"));
    },
  });

  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const b = q.data;
  const started = new Date(b.starts_at) <= new Date();
  const actions = nextStatuses(b.status, {
    manage: can("bookings.write"),
    cancelInProgress: me.role === "owner" || me.role === "admin",
    started,
  });
  const run = (path: string, json: unknown) => {
    setSaved(null);
    mutation.mutate({ path, json });
  };
  const when = (iso: string) => `${formatDay(localDate(iso), "ru", { weekday: "short", day: "numeric", month: "long" })}, ${localTime(iso)}`;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/bookings" className="text-fg-muted hover:text-fg">← {t("back")}</Link>
      </p>
      <PageHeader title={b.reference}>
        <StatusBadge status={b.status} />
      </PageHeader>

      <div className="mb-6 flex flex-wrap gap-2">
        {actions.map((a) => (
          <Btn
            key={a.status}
            variant={a.status === "cancelled" || a.status === "no_show" ? "danger" : "primary"}
            disabled={mutation.isPending}
            onClick={() => {
              if (a.needsAmount || a.needsReason) {
                setAmount(String(b.total_kzt));
                setReason("");
                setDialog(a);
              } else {
                run("/status", { status: a.status });
              }
            }}
          >
            {t(`actions.${a.status as "confirmed"}`)}
          </Btn>
        ))}
      </div>
      {mutation.error && !dialog && <div className="mb-6"><ErrorBox error={mutation.error} /></div>}
      {saved && <div className="mb-6"><Notice>{saved}</Notice></div>}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title={t("details")}>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-fg-muted uppercase">{t("when")}</dt>
                <dd>{when(b.starts_at)} → {when(b.ends_at)}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted uppercase">{t("employee")}</dt>
                <dd>{b.employee.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted uppercase">{t("customer")}</dt>
                <dd>
                  {can("customers.read") ? (
                    <Link href={`/admin/customers/${b.customer_id}`} className="text-accent hover:underline">{b.customer_name}</Link>
                  ) : (
                    b.customer_name
                  )}
                  <span className="block text-sm tabular-nums">
                    <a href={telHref(b.customer_phone)} className="hover:text-accent">{phoneDisplay(b.customer_phone)}</a>
                    {" · "}
                    <a
                      href={whatsappHref(b.customer_phone, t("whatsappText", { reference: b.reference, when: when(b.starts_at) }))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-accent"
                    >
                      WhatsApp
                    </a>
                  </span>
                  {b.customer_email && <span className="block text-sm text-fg-muted">{b.customer_email}</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted uppercase">{t("vehicle")}</dt>
                <dd>
                  {b.vehicle}
                  {b.vehicle_note && <span className="block text-sm text-fg-muted">{b.vehicle_note}</span>}
                </dd>
              </div>
              {b.customer_comment && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-fg-muted uppercase">{t("comment")}</dt>
                  <dd className="whitespace-pre-line">{b.customer_comment}</dd>
                </div>
              )}
              {b.cancel_reason && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-fg-muted uppercase">{t("cancelReason")}</dt>
                  <dd>{b.cancel_reason}</dd>
                </div>
              )}
            </dl>
          </Card>

          {can("bookings.write") && (
            <Card title={t("notes")}>
              <textarea
                aria-label={t("notes")}
                rows={3}
                value={notes ?? b.internal_notes ?? ""}
                onChange={(e) => setNotes(e.target.value)}
                className={`${inputCls} py-2`}
              />
              <Btn className="mt-3" disabled={notes === null || mutation.isPending} onClick={() => run("", { internal_notes: notes })}>
                {t("saveNotes")}
              </Btn>
            </Card>
          )}

          {can("bookings.write") && (b.status === "pending" || b.status === "confirmed") && (
            <Card title={t("reschedule")}>
              {move ? (
                <form
                  className="grid gap-3 sm:grid-cols-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run("/reschedule", {
                      starts_at: almatyIso(move.date, move.time),
                      employee_id: move.employee ? Number(move.employee) : null,
                    });
                  }}
                >
                  <Field label={t("date")} htmlFor="m-date">
                    <input id="m-date" type="date" required value={move.date} onChange={(e) => setMove({ ...move, date: e.target.value })} className={inputCls} />
                  </Field>
                  <Field label={t("time")} htmlFor="m-time">
                    <input id="m-time" type="time" step={1800} required value={move.time} onChange={(e) => setMove({ ...move, time: e.target.value })} className={inputCls} />
                  </Field>
                  <Field label={t("employee")} htmlFor="m-emp">
                    <select id="m-emp" value={move.employee} onChange={(e) => setMove({ ...move, employee: e.target.value })} className={inputCls}>
                      {(employees.data ?? []).filter((e) => e.is_bookable).map((e) => (
                        <option key={e.id} value={e.id}>{e.display_name}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="flex items-end gap-2">
                    <Btn type="submit" variant="primary" disabled={mutation.isPending}>{t("move")}</Btn>
                    <Btn onClick={() => setMove(null)}>{t("cancelEdit")}</Btn>
                  </div>
                </form>
              ) : (
                <Btn onClick={() => setMove({ date: localDate(b.starts_at), time: localTime(b.starts_at), employee: String(b.employee.id) })}>
                  {t("changeTime")}
                </Btn>
              )}
            </Card>
          )}

          <Card title={t("history")}>
            <ol className="space-y-3 text-sm">
              {b.history.map((h, i) => (
                <li key={i} className="flex flex-wrap gap-x-3">
                  <span className="text-fg-muted tabular-nums">
                    {new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Almaty" }).format(new Date(h.at))}
                  </span>
                  <span>{t(`events.${h.action.replace("booking.", "") as "created"}`)}</span>
                  {h.after?.status ? <span>→ {ts(String(h.after.status) as "pending")}</span> : null}
                  <span className="text-fg-muted">{h.actor === "public" ? t("byCustomer") : h.actor}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <Card title={t("price")}>
          <PriceLines
            lines={b.items.map((i) => ({ name: i.name, detail: i.options.join(", "), price: i.price_kzt }))}
            discount={b.discount_kzt ? { name: b.discount_name ?? "", amount: b.discount_kzt } : null}
            total={b.total_kzt}
            final={b.final_amount_kzt}
          />
        </Card>
      </div>

      <Dialog open={!!dialog} onClose={() => setDialog(null)} title={dialog ? t(`actions.${dialog.status as "confirmed"}`) : ""}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!dialog) return;
            run("/status", {
              status: dialog.status,
              ...(dialog.needsAmount ? { final_amount_kzt: Number(amount) } : {}),
              ...(dialog.needsReason ? { reason: reason.trim() || null } : {}),
            });
          }}
        >
          {dialog?.needsAmount && (
            <Field label={t("finalAmount")} htmlFor="amount" hint={t("finalAmountHint")}>
              <input id="amount" type="number" min={0} step={500} required value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
            </Field>
          )}
          {dialog?.needsReason && (
            <Field label={t("reason")} htmlFor="reason">
              <textarea id="reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputCls} py-2`} />
            </Field>
          )}
          {mutation.error && <ErrorBox error={mutation.error} />}
          <div className="flex gap-2">
            <Btn type="submit" variant={dialog?.status === "cancelled" ? "danger" : "primary"} disabled={mutation.isPending}>
              {t("confirmAction")}
            </Btn>
            <Btn onClick={() => setDialog(null)}>{t("cancelEdit")}</Btn>
          </div>
        </form>
      </Dialog>
    </>
  );
}
