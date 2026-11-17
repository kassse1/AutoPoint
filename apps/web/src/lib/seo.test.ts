import { describe, expect, it } from "vitest";
import { jsonLd, pageMetadata } from "./seo";

describe("pageMetadata", () => {
  it("builds canonical and hreflang alternates (ru without prefix)", () => {
    const meta = pageMetadata({ locale: "kk", path: "/services/ppf", title: "T", description: "D", siteName: "S" });
    expect(meta.alternates?.canonical).toBe("http://localhost:3000/kk/services/ppf");
    expect(meta.alternates?.languages).toEqual({
      ru: "http://localhost:3000/services/ppf",
      kk: "http://localhost:3000/kk/services/ppf",
      en: "http://localhost:3000/en/services/ppf",
      "x-default": "http://localhost:3000/services/ppf",
    });
  });
});

describe("jsonLd", () => {
  it("escapes < so content cannot close the script tag", () => {
    const out = jsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>");
  });
});
