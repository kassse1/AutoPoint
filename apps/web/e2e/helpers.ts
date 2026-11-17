import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "autopoint-demo-2026"; // dev seed only, see README
let counter = 0;
export const uniquePhone = () => `+7 701 ${String(Date.now() + counter++).slice(-7)}`;

export async function loginAsAdmin(page: Page, email = "owner@autopoint.demo") {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("link", { name: "Обзор" })).toBeVisible();
}

export async function apiToken(request: APIRequestContext, email: string) {
  const res = await request.post("/api/v1/auth/login", { data: { email, password: DEMO_PASSWORD } });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** First free start time a few days ahead, via the public API. */
export async function freeSlot(request: APIRequestContext) {
  const services = (await (await request.get("/api/v1/public/services")).json()) as { slug: string }[];
  const service = services[0].slug;
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const res = await request.get(
    `/api/v1/public/availability?service=${service}&vehicle=sedan&date_from=${day(3)}&date_to=${day(10)}`,
  );
  expect(res.status()).toBe(200);
  const days = ((await res.json()) as { days: { slots: { start: string }[] }[] }).days;
  const slot = days.flatMap((d) => d.slots)[0];
  expect(slot, "a free slot in the next week").toBeTruthy();
  return { service, start: slot.start };
}

/** POST /public/bookings the way the wizard does it (an Idempotency-Key per attempt). */
export const createBooking = (request: APIRequestContext, data: object) =>
  request.post("/api/v1/public/bookings", { data, headers: { "Idempotency-Key": crypto.randomUUID() } });

export const bookingBody = (service: string, start: string, phone = uniquePhone()) => ({
  selection: { service, vehicle: "sedan", options: [], addons: [], locale: "ru" },
  starts_at: start,
  customer: { name: "E2E Тест", phone },
  consent: true,
});
