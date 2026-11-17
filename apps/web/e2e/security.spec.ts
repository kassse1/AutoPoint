import { expect, test } from "@playwright/test";
import { apiToken, bookingBody, createBooking, freeSlot, uniquePhone } from "./helpers";

test.describe("access control", () => {
  test("anonymous visitors cannot read the admin API", async ({ request }) => {
    for (const path of ["/api/v1/admin/bookings", "/api/v1/admin/customers", "/api/v1/auth/me"]) {
      expect((await request.get(path)).status(), path).toBe(401);
    }
  });

  test("a customer's booking link does not open the admin API", async ({ request }) => {
    const { service, start } = await freeSlot(request);
    const created = await createBooking(request, bookingBody(service, start));
    expect(created.status()).toBe(201);
    const { manage_token } = (await created.json()) as { manage_token: string };
    const res = await request.get("/api/v1/admin/bookings", { headers: { Authorization: `Bearer ${manage_token}` } });
    expect(res.status()).toBe(401);
    await request.post("/api/v1/public/bookings/cancel", { data: { token: manage_token } });
  });

  test("an employee cannot manage users", async ({ request }) => {
    const token = await apiToken(request, "erlan@autopoint.demo");
    const res = await request.get("/api/v1/admin/users", { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(403);
  });

  test("the admin redirects to the login page without a session", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe("booking validation", () => {
  test("the same time cannot be booked once every master is taken", async ({ request }) => {
    const { service, start } = await freeSlot(request);
    const tokens: string[] = [];
    let conflict: { status: number; code?: string } | null = null;
    for (let i = 0; i < 6 && !conflict; i++) {
      const res = await createBooking(request, bookingBody(service, start));
      if (res.status() === 201) tokens.push(((await res.json()) as { manage_token: string }).manage_token);
      else conflict = { status: res.status(), code: ((await res.json()) as { code: string }).code };
    }
    expect(tokens.length).toBeGreaterThan(0);
    expect(conflict).toEqual({ status: 409, code: "SLOT_UNAVAILABLE" });
    for (const token of tokens) await request.post("/api/v1/public/bookings/cancel", { data: { token } });
  });

  test("invalid bookings are rejected", async ({ request }) => {
    const { service, start } = await freeSlot(request);
    const post = (data: object) => createBooking(request, data);
    const valid = bookingBody(service, start);

    // A price sent by the client is not accepted (mass assignment).
    expect((await post({ ...valid, total_kzt: 1 })).status()).toBe(422);
    // No consent to personal data processing.
    expect((await post({ ...valid, consent: false })).status()).toBe(422);
    // Not a phone number.
    expect((await post({ ...valid, customer: { name: "E2E", phone: "12345" } })).status()).toBe(422);
    // In the past.
    const past = await post({ ...valid, starts_at: "2020-01-06T05:00:00Z", customer: { name: "E2E", phone: uniquePhone() } });
    expect([409, 422]).toContain(past.status());
  });
});

test("security headers are sent on pages and API responses", async ({ request }) => {
  for (const path of ["/", "/api/v1/public/site"]) {
    const headers = (await request.get(path)).headers();
    expect(headers["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(headers["x-powered-by"], path).toBeUndefined();
  }
});
