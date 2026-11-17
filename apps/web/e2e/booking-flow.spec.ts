import { expect, test } from "@playwright/test";
import { loginAsAdmin, uniquePhone } from "./helpers";

// One story, in order: a customer books online, staff confirm it, the customer sees it.
test.describe.serial("booking flow", () => {
  let reference = "";
  let manageUrl = "";

  test("customer books a service through the 7-step wizard", async ({ page }) => {
    const next = page.getByRole("button", { name: "Далее" });
    await page.goto("/booking");
    await page.getByRole("radiogroup", { name: "Выберите услугу" }).getByRole("radio").first().click();
    await next.click();

    await page.getByRole("radiogroup", { name: "Класс автомобиля" }).getByRole("radio", { name: /Седан/ }).click();
    await next.click();

    // Options: the defaults are preselected.
    await expect(page.getByRole("heading", { name: "Опции и дополнительные услуги" })).toBeVisible();
    await next.click();

    await page.getByRole("radiogroup", { name: "Время начала" }).getByRole("radio").first().click();
    await next.click();

    await page.getByLabel("Имя").fill("Покупатель E2E");
    await page.getByLabel("Телефон").fill(uniquePhone());
    await page.getByRole("checkbox", { name: /Согласен/ }).check();
    await next.click();

    await expect(page.getByRole("heading", { name: "Проверьте запись" })).toBeVisible();
    await page.getByRole("button", { name: "Подтвердить запись" }).click();

    await expect(page.getByText("Запись создана")).toBeVisible();
    await expect(page.getByText("Ожидает подтверждения")).toBeVisible();
    reference = (await page.getByRole("heading", { level: 1 }).innerText()).trim();
    expect(reference).toMatch(/^[A-Z0-9-]{6,}$/);
    manageUrl = page.url();
  });

  test("staff confirm the booking in the admin", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/bookings");
    await page.getByLabel("Поиск").fill(reference);
    await page.getByRole("link", { name: reference }).first().click();
    await page.getByRole("button", { name: "Подтвердить", exact: true }).click();
    await expect(page.getByText("Подтверждена").first()).toBeVisible();
  });

  test("the customer's page shows the confirmed status", async ({ page }) => {
    await page.goto(manageUrl);
    await expect(page.getByText("Подтверждена")).toBeVisible();
  });
});

test("staff change a master's weekly schedule", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/staff");
  await page.getByRole("link", { name: /Ерлан/ }).first().click();
  const from = page.getByLabel("Понедельник: с");
  await expect(from).toBeVisible();
  const original = await from.inputValue();
  const changed = original === "10:00" ? "09:30" : "10:00";
  const save = page.getByRole("button", { name: "Сохранить график" });

  await from.fill(changed);
  await save.click();
  await expect(page.getByText("Сохранено.").first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Понедельник: с")).toHaveValue(changed);

  // Put the demo schedule back.
  await page.getByLabel("Понедельник: с").fill(original);
  await save.click();
  await expect(page.getByText("Сохранено.").first()).toBeVisible();
});
