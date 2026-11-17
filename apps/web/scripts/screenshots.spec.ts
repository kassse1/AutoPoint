import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Portfolio screenshots (docs/screenshots) from a FRESH production stack with the demo seed:
//   SHOTS_EMAIL=… SHOTS_PASSWORD=… E2E_BASE_URL=https://localhost npm run screenshots
// It first books a few visits through the public API for clearly labelled demo customers,
// so the admin screens show realistic content instead of test data.
const OUT = "../../docs/screenshots";
const EMAIL = process.env.SHOTS_EMAIL ?? "";
const PASSWORD = process.env.SHOTS_PASSWORD ?? "";
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.jpg`, quality: 80 });

test.use({ ignoreHTTPSErrors: true });

const DEMO_CUSTOMERS = ["Айдос (демо)", "Мария (демо)", "Ержан (демо)", "Dana (demo)", "Тимур (демо)", "Алина (демо)"];
const VEHICLES = ["sedan", "crossover", "suv", "compact", "large_suv", "sedan"];

async function seedDemoBookings(request: APIRequestContext) {
  const login = await request.post("/api/v1/auth/login", { data: { email: EMAIL, password: PASSWORD } });
  expect(login.status(), "owner login (SHOTS_EMAIL / SHOTS_PASSWORD)").toBe(200);
  const auth = { Authorization: `Bearer ${((await login.json()) as { access_token: string }).access_token}` };
  const services = (await (await request.get("/api/v1/public/services")).json()) as { slug: string }[];
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  for (const [i, name] of DEMO_CUSTOMERS.entries()) {
    const service = services[i % services.length].slug;
    const vehicle = VEHICLES[i];
    const avail = await request.get(
      `/api/v1/public/availability?service=${service}&vehicle=${vehicle}&date_from=${day(1 + i)}&date_to=${day(8 + i)}`,
    );
    const slot = ((await avail.json()) as { days: { slots: { start: string }[] }[] }).days.flatMap((d) => d.slots)[0];
    if (!slot) continue;
    const created = await request.post("/api/v1/public/bookings", {
      headers: { "Idempotency-Key": crypto.randomUUID() },
      data: {
        selection: { service, vehicle, locale: "ru" },
        starts_at: slot.start,
        customer: { name, phone: `+7 700 000 00 0${i}` },
        consent: true,
      },
    });
    expect(created.status()).toBe(201);
    const { booking } = (await created.json()) as { booking: { reference: string } };
    if (i % 2 === 0) {
      const list = await request.get(`/api/v1/admin/bookings?q=${booking.reference}`, { headers: auth });
      const id = ((await list.json()) as { items: { id: number }[] }).items[0].id;
      await request.post(`/api/v1/admin/bookings/${id}/status`, { headers: auth, data: { status: "confirmed" } });
    }
  }
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("public site", async ({ page }) => {
    await page.goto("/");
    await shot(page, "home");
    await page.goto("/services");
    await shot(page, "services");
    await page.goto("/booking");
    await page.getByRole("radiogroup", { name: "Выберите услугу" }).getByRole("radio").first().click();
    await page.getByRole("button", { name: "Далее" }).click();
    await page.getByRole("radiogroup", { name: "Класс автомобиля" }).getByRole("radio", { name: /Кроссовер/ }).click();
    await page.getByRole("button", { name: "Далее" }).click();
    await expect(page.getByRole("heading", { name: "Опции и дополнительные услуги" })).toBeVisible();
    await expect(page.getByText("Итого")).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600); // the step's entry animation
    await shot(page, "booking-calculator");
    await page.getByRole("button", { name: "Далее" }).click();
    await page.getByRole("radiogroup", { name: "Время начала" }).getByRole("radio").first().waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
    await shot(page, "booking-time");
  });

  test("admin", async ({ page, request }) => {
    await seedDemoBookings(request);
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Пароль").fill(PASSWORD);
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page.getByRole("link", { name: "Обзор" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await shot(page, "admin-dashboard");
    for (const [path, name] of [
      ["/admin/bookings", "admin-bookings"],
      ["/admin/services", "admin-services"],
      ["/admin/staff", "admin-staff"],
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await shot(page, name);
    }
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test("public site", async ({ page }) => {
    await page.goto("/");
    await shot(page, "mobile-home");
    await page.goto("/booking");
    await page.waitForTimeout(800); // the service cards fade in
    await shot(page, "mobile-booking");
  });
});
