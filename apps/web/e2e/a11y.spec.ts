import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

const PUBLIC_PAGES = ["/", "/services", "/gallery", "/about", "/contacts", "/booking", "/privacy", "/kk", "/en/services"];
const ADMIN_PAGES = ["/admin", "/admin/bookings", "/admin/services", "/admin/staff", "/admin/settings"];

/** WCAG 2.1 A/AA through axe; also fails on console errors (CSP violations are reported there). */
async function audit(page: Page, path: string) {
  const errors: string[] = [];
  const onConsole = (m: { type(): string; text(): string }) => {
    if (m.type() === "error") errors.push(m.text());
  };
  page.on("console", onConsole);
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  page.off("console", onConsole);
  const report = violations.map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target}`);
  expect(report, `axe on ${path}`).toEqual([]);
  expect(errors, `console errors on ${path}`).toEqual([]);
}

for (const path of PUBLIC_PAGES) {
  test(`public page ${path} has no accessibility violations`, async ({ page }) => audit(page, path));
}

test("a service page has no accessibility violations", async ({ page, request }) => {
  const [first] = (await (await request.get("/api/v1/public/services")).json()) as { slug: string }[];
  await audit(page, `/services/${first.slug}`);
});

test("the admin login has no accessibility violations", async ({ page }) => audit(page, "/admin/login"));

test("admin pages have no accessibility violations", async ({ page }) => {
  await loginAsAdmin(page);
  for (const path of ADMIN_PAGES) await audit(page, path);
});
