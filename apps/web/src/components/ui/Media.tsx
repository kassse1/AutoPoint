import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { demoPhoto } from "@/lib/demoPhotos";

/**
 * A real photo when there is one; otherwise a labelled demo stock photo. `before` gives the
 * demo photo a dull, dusty look so before/after sliders still read correctly.
 */
export async function Media({
  src,
  alt,
  demo,
  variant = "neutral",
  sizes = "(min-width: 1024px) 33vw, 100vw",
  priority = false,
  className = "aspect-[4/3]",
}: {
  src: string | null | undefined;
  alt: string;
  /** Picks the demo photo (a service slug, a gallery id); defaults to the alt text. */
  demo?: string;
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
  const before = variant === "before";
  return (
    <div className={`relative overflow-hidden bg-surface ${className}`}>
      <Image
        src={demoPhoto(demo ?? alt)}
        alt={`${alt} (${t("illustration")})`}
        fill
        sizes={sizes}
        priority={priority}
        className={`object-cover ${before ? "brightness-[0.6] contrast-[0.8] blur-[0.6px] grayscale-[0.6] sepia-[0.35]" : ""}`}
      />
      {before && (
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgb(120_105_80/0.35),transparent_60%),linear-gradient(rgb(90_80_60/0.25),rgb(90_80_60/0.25))] mix-blend-multiply" />
      )}
      <span className="absolute right-3 bottom-3 rounded-full bg-black/50 px-2 py-0.5 text-[10px] tracking-[0.12em] text-fg/70 uppercase backdrop-blur">
        {t("illustration")}
      </span>
    </div>
  );
}
