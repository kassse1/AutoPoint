"use client";

import { MapPin } from "lucide-react";
import { useState } from "react";

/**
 * Click-to-load OpenStreetMap embed: no third-party requests (or layout cost) until the
 * visitor asks for the map. No API key needed.
 */
export function MapEmbed({
  lat,
  lng,
  title,
  loadLabel,
  notice,
}: {
  lat: number;
  lng: number;
  title: string;
  loadLabel: string;
  notice: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const d = 0.008;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d}%2C${lat - d / 2}%2C${lng + d}%2C${lat + d / 2}&layer=mapnik&marker=${lat}%2C${lng}`;
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-line bg-surface sm:aspect-[16/10]">
      {loaded ? (
        <iframe
          src={src}
          title={title}
          className="h-full w-full grayscale invert-[0.9] hue-rotate-180"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <MapPin className="size-8 text-accent" strokeWidth={1.5} aria-hidden="true" />
          <button
            type="button"
            onClick={() => setLoaded(true)}
            className="min-h-11 border border-line px-5 text-sm hover:border-fg/50"
          >
            {loadLabel}
          </button>
          <p className="max-w-xs text-xs text-fg-muted">{notice}</p>
        </div>
      )}
    </div>
  );
}
