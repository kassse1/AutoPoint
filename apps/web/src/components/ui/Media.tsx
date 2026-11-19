import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { demoPhoto, unsplashImg } from "@/lib/demoPhotos";

/** A real photo when there is one; otherwise a labelled demo stock photo. */
export async function Media({
  src,
  alt,
  demo,
  sizes = "(min-width: 1024px) 33vw, 100vw",
  priority = false,
  className = "aspect-[4/3]",
}: {
  src: string | null | undefined;
  alt: string;
  /** Picks the demo photo (see demoPhoto); defaults to the alt text. */
  demo?: string;
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
    <div className={`relative overflow-hidden bg-surface ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- resized by Unsplash's CDN, see unsplashImg */}
      <img
        {...unsplashImg(demoPhoto(demo ?? alt))}
        alt={`${alt} (${t("illustration")})`}
        sizes={sizes}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <span className="absolute right-3 bottom-3 rounded-full bg-black/50 px-2 py-0.5 text-[10px] tracking-[0.12em] text-fg/70 uppercase backdrop-blur">
        {t("illustration")}
      </span>
    </div>
  );
}
