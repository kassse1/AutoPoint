import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import ru from "../../../messages/ru.json";
import { PriceSummary } from "./PriceSummary";

const plain = (s: string | null) => (s ?? "").replace(/[  ]/g, " ");

describe("PriceSummary", () => {
  it("shows lines, the discount and the API total in KZT", () => {
    render(
      <NextIntlClientProvider locale="ru" messages={ru}>
        <PriceSummary
          locale="ru"
          lines={[
            { name: "Экстерьерный детейлинг", price: 25_000 },
            { name: "Детейлинг салона", detail: "Озонирование", price: 55_000 },
          ]}
          subtotal={80_000}
          discount={{ name: "Кузов + салон", amount_kzt: 8_000 }}
          total={72_000}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Озонирование")).toBeTruthy();
    expect(plain(screen.getByText(/Скидка/).textContent)).toBe("Скидка «Кузов + салон»");
    expect(plain(screen.getByText(/−/).textContent)).toBe("−8 000 ₸");
    // The total is announced to screen readers when it changes.
    expect(plain(screen.getByText(/72/).textContent)).toBe("72 000 ₸");
    expect(screen.getByText(/72/).getAttribute("aria-live")).toBe("polite");
  });

  it("hides subtotal and discount rows when there is no discount", () => {
    render(
      <NextIntlClientProvider locale="en" messages={ru}>
        <PriceSummary locale="en" lines={[{ name: "Wash", price: 25_000 }]} subtotal={25_000} total={25_000} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByText(/Скидка/)).toBeNull();
    expect(screen.queryByText("Сумма")).toBeNull();
  });
});
