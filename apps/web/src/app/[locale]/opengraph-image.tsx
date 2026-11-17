import { ImageResponse } from "next/og";
import { api } from "@/lib/api/client";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "AutoPoint";

// Latin text only: the built-in OG font has no Cyrillic glyphs, so the card uses the
// English business data for every locale.
export default async function OpenGraphImage() {
  const site = await api.site("en");
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#0d0d0e",
          color: "#f3efe8",
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 8, color: site.accent_color }}>DETAILING STUDIO</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 120, fontWeight: 700, letterSpacing: 6 }}>{site.business_name.toUpperCase()}</div>
          <div style={{ width: 160, height: 3, background: site.accent_color, marginTop: 24 }} />
        </div>
        <div style={{ fontSize: 32, color: "#a7a198" }}>{site.city}</div>
      </div>
    ),
    size,
  );
}
