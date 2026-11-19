import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const dev = process.env.NODE_ENV !== "production";

// One policy for the whole site. Next.js injects inline scripts, and a nonce-based CSP would
// force every page to render dynamically (no ISR), so scripts allow 'unsafe-inline'; React
// escaping is the XSS defence, and everything else is locked down (see docs, threat T9).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src https://www.openstreetmap.org",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "X-Frame-Options", value: "DENY" },
  // Browsers honour HSTS only over HTTPS, so sending it on local http is harmless.
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  output: "standalone",
  // Demo stock photos (src/lib/demoPhotos.ts), shown until real ones are uploaded.
  images: { remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }] },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Cache Components is off on purpose: it prerenders API data at build time, so images
  // could not be built without a running API. Pages use on-demand ISR instead (see layout).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
