import { Star } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { GalleryItem, Review } from "@/lib/api/client";
import { BeforeAfter } from "@/components/ui/BeforeAfter";
import { Media } from "@/components/ui/Media";
import { ButtonLink, DemoBadge } from "@/components/ui/primitives";

/** Before/after slider (or single image) for one gallery item, with caption and demo badge. */
export async function GalleryFigure({ item, sizes }: { item: GalleryItem; sizes?: string }) {
  const t = await getTranslations("Common");
  return (
    <figure>
      {item.kind === "before_after" ? (
        <BeforeAfter
          before={<Media src={item.before_image_url} alt={item.alt} variant="before" sizes={sizes} className="aspect-[16/10]" />}
          after={<Media src={item.image_url} alt={item.alt} variant="after" sizes={sizes} className="aspect-[16/10]" />}
          beforeLabel={t("before")}
          afterLabel={t("after")}
          sliderLabel={t("compare", { title: item.alt })}
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-line">
          <Media src={item.image_url} alt={item.alt} variant="after" sizes={sizes} className="aspect-[16/10]" />
        </div>
      )}
      <figcaption className="mt-3 flex flex-wrap items-center gap-3 text-sm text-fg-muted">
        <span>{item.caption ?? item.alt}</span>
        {item.is_demo && <DemoBadge label={t("demo")} />}
      </figcaption>
    </figure>
  );
}

export async function ReviewCard({ review }: { review: Review }) {
  const t = await getTranslations("Common");
  const format = await getFormatter();
  return (
    <figure className="flex h-full flex-col border border-line bg-surface/40 p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        {review.rating != null && (
          <p role="img" className="flex gap-1 text-accent" aria-label={t("rating", { rating: review.rating })}>
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                className="size-4"
                strokeWidth={1.5}
                fill={i < review.rating! ? "currentColor" : "none"}
                aria-hidden="true"
              />
            ))}
          </p>
        )}
        {review.is_demo && <DemoBadge label={t("demoReview")} />}
      </div>
      <blockquote className="mt-6 flex-1 leading-relaxed" lang={review.locale}>
        “{review.body}”
      </blockquote>
      <figcaption className="mt-6 border-t border-line pt-4 text-sm">
        <span className="font-semibold">{review.author_name}</span>
        {review.vehicle && <span className="text-fg-muted"> · {review.vehicle}</span>}
        <span className="block text-xs text-fg-muted">
          {format.dateTime(new Date(review.review_date), { dateStyle: "long", timeZone: "UTC" })}
        </span>
      </figcaption>
    </figure>
  );
}

export async function CtaBand() {
  const t = await getTranslations("Cta");
  return (
    <section className="border-t border-line">
      <div className="container-page flex flex-col items-start gap-8 py-20 sm:py-24 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h2>
          <p className="mt-4 text-lg text-fg-muted">{t("lead")}</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <ButtonLink href="/booking">{t("book")}</ButtonLink>
          <ButtonLink href="/contacts" variant="secondary">
            {t("contacts")}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
