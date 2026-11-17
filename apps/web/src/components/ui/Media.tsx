import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { CarArt } from "./CarArt";

/** A real photo when there is one; otherwise the labelled demo illustration. */
export async function Media({
  src,
  alt,
  variant = "neutral",
  sizes = "(min-width: 1024px) 33vw, 100vw",
  priority = false,
  className = "aspect-[4/3]",
}: {
  src: string | null | undefined;
  alt: string;
  variant?: "neutral" | "before" | "after";
  sizes?: string;
  priority?: boolean;
  className?: string;
}) {
  if (src) {
    return (
      <div className={`relative overflow-hidden bg-surface ${className}`}>
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
      </div>
    );
  }
  const t = await getTranslations("Common");
  return (
    <div
      role="img"
      aria-label={`${alt} (${t("illustration")})`}
      className={`relative flex items-center justify-center overflow-hidden bg-surface ${className}`}
    >
      <CarArt variant={variant} className="h-full w-full p-[6%]" />
      <span className="absolute right-3 bottom-3 text-[11px] tracking-[0.12em] text-fg-muted uppercase">
        {t("illustration")}
      </span>
    </div>
  );
}
