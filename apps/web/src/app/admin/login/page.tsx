"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Btn, ErrorBox, Field, inputCls } from "@/components/admin/ui";
import { signIn } from "@/lib/admin/api";

const schema = z.object({
  email: z.string().trim().min(3, "required").max(200),
  password: z.string().min(1, "required").max(128),
});
type Form = z.infer<typeof schema>;

function LoginForm() {
  const t = useTranslations("Admin.login");
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [error, setError] = useState<unknown>(null);
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const { errors, isSubmitting } = form.formState;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async ({ email, password }) => {
        setError(null);
        try {
          await signIn(email, password);
          // Only same-app paths: never redirect to another site after login.
          router.replace(next?.startsWith("/admin") ? next : "/admin");
        } catch (e) {
          setError(e);
        }
      })}
      className="w-full max-w-sm space-y-5"
    >
      <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
      <ErrorBox error={error} />
      <Field label={t("email")} htmlFor="email" error={errors.email && t("required")}>
        <input id="email" type="email" autoComplete="username" aria-invalid={!!errors.email} {...form.register("email")} className={inputCls} />
      </Field>
      <Field label={t("password")} htmlFor="password" error={errors.password && t("required")}>
        <input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...form.register("password")} className={inputCls} />
      </Field>
      <Btn type="submit" variant="primary" disabled={isSubmitting} className="w-full">
        {isSubmitting ? t("signingIn") : t("submit")}
      </Btn>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
