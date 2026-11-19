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
  const at = (w: number) => `${src}?w=${w}&q=70&auto=format&fit=crop`;
  return { src: at(1080), srcSet: [480, 828, 1280, 1920].map((w) => `${at(w)} ${w}w`).join(", ") };
}

/** Same key → same photo, so a page doesn't reshuffle between renders. */
export function demoPhoto(key: string): string {
  if (BY_SLUG[key]) return BY_SLUG[key];
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return POOL[hash % POOL.length];
}
