"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Btn, Card, Dialog, ErrorBox, Field, inputCls, Loading, PageHeader } from "@/components/admin/ui";
import { api, type User } from "@/lib/admin/api";
import { useAuth } from "@/lib/admin/auth";

const ROLES = ["owner", "admin", "manager", "employee"] as const;

export default function UsersPage() {
  const t = useTranslations("Admin.users");
  const tr = useTranslations("Admin.roles");
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["users"], queryFn: () => api<User[]>("/admin/users") });
  const [draft, setDraft] = useState({ email: "", full_name: "", role: "manager", password: "" });
  const [resetFor, setResetFor] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const done = () => queryClient.invalidateQueries({ queryKey: ["users"] });
  const create = useMutation({
    mutationFn: () => api<User>("/admin/users", { method: "POST", json: draft }),
    onSuccess: () => { done(); setDraft({ email: "", full_name: "", role: "manager", password: "" }); },
  });
  const update = useMutation({
    mutationFn: ({ id, json }: { id: string; json: object }) => api<User>(`/admin/users/${id}`, { method: "PATCH", json }),
    onSuccess: () => { done(); setResetFor(null); setNewPassword(""); },
  });
  // Only owners manage owner accounts; the API enforces it, the UI just hides what won't work.
  const roles = ROLES.filter((r) => r !== "owner" || me.role === "owner");

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          {q.isPending ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : (
            // relative: keeps the visually hidden column header inside the scroll box
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="text-xs tracking-wide text-fg-muted uppercase">
                  <tr className="border-b border-line">
                    <th scope="col" className="px-2 py-2 font-medium">{t("user")}</th>
                    <th scope="col" className="px-2 py-2 font-medium">{t("role")}</th>
                    <th scope="col" className="px-2 py-2 font-medium">{t("state")}</th>
                    <th scope="col" className="px-2 py-2 font-medium"><span className="sr-only">{t("actions")}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {q.data.map((u) => {
                    const locked = u.role === "owner" && me.role !== "owner";
                    return (
                      <tr key={u.id} className={u.is_active ? "" : "text-fg-muted"}>
                        <td className="px-2 py-2">{u.full_name}<span className="block text-xs text-fg-muted">{u.email}</span></td>
                        <td className="px-2 py-2">
                          <select aria-label={t("roleOf", { name: u.full_name })} value={u.role} disabled={locked || u.id === me.id}
                            onChange={(e) => update.mutate({ id: u.id, json: { role: e.target.value } })} className={`${inputCls} w-36`}>
                            {(locked ? ROLES : roles).map((r) => <option key={r} value={r}>{tr(r)}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-2 text-xs">
                          {u.is_active ? t("active") : t("disabled")}{u.locked ? ` · ${t("locked")}` : ""}
                        </td>
                        <td className="px-2 py-2">
                          {!locked && (
                            <div className="flex flex-wrap gap-2">
                              {u.locked && <Btn onClick={() => update.mutate({ id: u.id, json: { unlock: true } })}>{t("unlock")}</Btn>}
                              <Btn onClick={() => setResetFor(u)}>{t("resetPassword")}</Btn>
                              {u.id !== me.id && (
                                <Btn variant={u.is_active ? "danger" : "secondary"} onClick={() => update.mutate({ id: u.id, json: { is_active: !u.is_active } })}>
                                  {u.is_active ? t("disable") : t("enable")}
                                </Btn>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3"><ErrorBox error={update.error} /></div>
        </Card>
        <Card title={t("new")}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <Field label={t("name")} htmlFor="u-name"><input id="u-name" required minLength={2} value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} className={inputCls} /></Field>
            <Field label={t("email")} htmlFor="u-email"><input id="u-email" type="email" required value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className={inputCls} /></Field>
            <Field label={t("role")} htmlFor="u-role">
              <select id="u-role" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} className={inputCls}>
                {roles.map((r) => <option key={r} value={r}>{tr(r)}</option>)}
              </select>
            </Field>
            <Field label={t("password")} htmlFor="u-pass" hint={t("passwordHint")}>
              <input id="u-pass" type="password" autoComplete="new-password" required minLength={10} value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} className={inputCls} />
            </Field>
            <ErrorBox error={create.error} />
            <Btn type="submit" variant="primary" disabled={create.isPending}>{t("create")}</Btn>
          </form>
        </Card>
      </div>

      <Dialog open={!!resetFor} onClose={() => setResetFor(null)} title={t("resetFor", { name: resetFor?.full_name ?? "" })}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (resetFor) update.mutate({ id: resetFor.id, json: { password: newPassword } }); }}>
          <Field label={t("newPassword")} htmlFor="u-new" hint={t("resetHint")}>
            <input id="u-new" type="password" autoComplete="new-password" required minLength={10} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} />
          </Field>
          <ErrorBox error={update.error} />
          <div className="flex gap-2">
            <Btn type="submit" variant="primary" disabled={update.isPending}>{t("resetPassword")}</Btn>
            <Btn onClick={() => setResetFor(null)}>{t("cancel")}</Btn>
          </div>
        </form>
      </Dialog>
    </>
  );
}
