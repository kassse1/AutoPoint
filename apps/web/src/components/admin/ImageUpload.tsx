"use client";

import { useMutation } from "@tanstack/react-query";
import { ImageUp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { api, type Upload } from "@/lib/admin/api";
import { ErrorBox } from "./ui";

/** Picks an image, uploads it (the server re-encodes it to WebP) and reports its URL. */
export function ImageUpload({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (url: string | null, size?: { width: number; height: number }) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("Admin.upload");
  const id = useId();
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api<Upload>("/admin/media", { method: "POST", form });
    },
    onSuccess: (u) => onChange(u.url, { width: u.width, height: u.height }),
  });

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium tracking-wide text-fg-muted uppercase">{label}</p>
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin preview of an uploaded file
          <img src={value} alt="" className="h-20 w-28 border border-line object-cover" />
        ) : (
          <span className="grid h-20 w-28 place-items-center border border-dashed border-line text-xs text-fg-muted">
            {t("none")}
          </span>
        )}
        {!disabled && (
          <>
            <label
              htmlFor={id}
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 border border-line px-4 text-sm hover:border-fg/50 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
            >
              <ImageUp className="size-4" aria-hidden="true" />
              {upload.isPending ? t("uploading") : value ? t("replace") : t("choose")}
              <input
                id={id}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={upload.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) upload.mutate(file);
                  e.target.value = "";
                }}
              />
            </label>
            {value && (
              <button type="button" onClick={() => onChange(null)} className="inline-flex min-h-10 items-center gap-1 px-2 text-sm text-fg-muted hover:text-danger">
                <X className="size-4" aria-hidden="true" />
                {t("remove")}
              </button>
            )}
          </>
        )}
      </div>
      <p className="mt-1 text-xs text-fg-muted">{t("hint")}</p>
      {upload.error && <div className="mt-2"><ErrorBox error={upload.error} /></div>}
    </div>
  );
}
