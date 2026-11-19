/**
 * Free Unsplash photos (unsplash.com/license) shown until the studio uploads its own:
 * hero photo in Settings, service and gallery photos in the admin. Always labelled "demo".
 */
const photo = (id: string) => `https://images.unsplash.com/photo-${id}`;

export const DEMO_HERO = photo("1622616727089-f82b2a67eaa8"); // car in a detailing light tunnel

const BY_SLUG: Record<string, string> = {
  "paint-correction": photo("1701846638400-83532a945f60"),
  "ceramic-coating": photo("1595418594939-0ae412241a50"),
  ppf: photo("1611859266720-147cc87658f1"),
  "interior-detailing": photo("1706675804659-4657c09b62da"),
  "deep-interior-cleaning": photo("1706675804659-4657c09b62da"),
  "headlight-restoration": photo("1663097518286-aaa8ce7e84e0"),
  "window-tinting": photo("1653673790585-4cf265dbdc79"),
  "exterior-detailing": photo("1621796398874-7c1e2aa4d888"),
};

// Real dirty → clean photos matched by subject (stock has no same-car pairs).
const PAIRS: Record<string, [before: string, after: string]> = {
  "paint-correction": [photo("1536796423601-e9733a86d257"), photo("1595418594939-0ae412241a50")],
  "headlight-restoration": [photo("1779263724565-7834ba0ec8a2"), photo("1631856507219-d1f3465b4884")],
  "deep-interior-cleaning": [photo("1770936450010-6837d6933caa"), photo("1614530499660-fe1fbd7921d6")],
};
const DEFAULT_PAIR: [string, string] = [photo("1770935883781-a2f5a52b69da"), photo("1696315072523-1bd90867944b")];

const POOL = [
  photo("1595418594939-0ae412241a50"),
  photo("1663097518286-aaa8ce7e84e0"),
  photo("1621796398874-7c1e2aa4d888"),
  photo("1712214910040-1f7f5925b16a"),
  photo("1653673790585-4cf265dbdc79"),
  photo("1701846638400-83532a945f60"),
];

/**
 * <img> attributes for an Unsplash photo resized and converted (AVIF/WebP) by Unsplash's CDN.
 * next/image would instead download the ~1.5 MB original and re-encode it on our small server.
 */
export function unsplashImg(src: string) {
  const at = (w: number) => `${src}?w=${w}&q=80&auto=format&fit=crop`;
  return { src: at(1280), srcSet: [480, 828, 1280, 1920, 2560].map((w) => `${at(w)} ${w}w`).join(", ") };
}

/**
 * Same key → same photo, so a page doesn't reshuffle between renders.
 * Keys: a service slug, "before:<slug>" / "after:<slug>" for comparison pairs, or any text.
 */
export function demoPhoto(key: string): string {
  const [side, slug] = key.split(":");
  if ((side === "before" || side === "after") && slug !== undefined) {
    return (PAIRS[slug] ?? DEFAULT_PAIR)[side === "before" ? 0 : 1];
  }
  if (BY_SLUG[key]) return BY_SLUG[key];
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return POOL[hash % POOL.length];
}
