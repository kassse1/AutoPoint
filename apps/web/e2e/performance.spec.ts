import { expect, test } from "@playwright/test";

// Budgets for the key public pages, measured in the browser on the production build.
// Local runs have no network throttling, so the timing budget is loose; the byte budgets
// are what catches regressions (a heavy library or an unoptimized image).
const BUDGET = { jsKb: 260, totalKb: 500, lcpMs: 2500, cls: 0.1 };

for (const path of ["/", "/services/exterior-detailing", "/booking"]) {
  test(`${path} stays within the performance budget`, async ({ page }) => {
    const bytes = { js: 0, total: 0 };
    const scripts: [string, number][] = [];
    page.on("requestfinished", async (request) => {
      const size = (await request.sizes()).responseBodySize; // bytes on the wire (compressed)
      bytes.total += size;
      if (request.resourceType() === "script") {
        bytes.js += size;
        scripts.push([request.url().split("/").pop() ?? "", Math.round(size / 1024)]);
      }
    });
    await page.goto(path, { waitUntil: "networkidle" });

    const { lcp, cls } = await page.evaluate(
      () =>
        new Promise<{ lcp: number; cls: number }>((resolve) => {
          let lcp = 0;
          let cls = 0;
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) lcp = e.startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
          new PerformanceObserver((list) => {
            for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[])
              if (!e.hadRecentInput) cls += e.value;
          }).observe({ type: "layout-shift", buffered: true });
          setTimeout(() => resolve({ lcp, cls }), 500);
        }),
    );

    const result = { path, jsKb: Math.round(bytes.js / 1024), totalKb: Math.round(bytes.total / 1024), lcpMs: Math.round(lcp), cls: Number(cls.toFixed(3)) };
    console.log(JSON.stringify(result), JSON.stringify(scripts.sort((a, b) => b[1] - a[1]).slice(0, 5)));
    expect(result.jsKb).toBeLessThanOrEqual(BUDGET.jsKb);
    expect(result.totalKb).toBeLessThanOrEqual(BUDGET.totalKb);
    expect(result.lcpMs).toBeLessThanOrEqual(BUDGET.lcpMs);
    expect(result.cls).toBeLessThanOrEqual(BUDGET.cls);
  });
}
