import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// SITE_URL is known only at runtime on hosts like Render, not at build time.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/booking/manage"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
