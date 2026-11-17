import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { GalleryFilter } from "./GalleryFilter";

describe("GalleryFilter", () => {
  it("filters items by category and reflects the choice with aria-pressed", async () => {
    render(
      <GalleryFilter
        categories={[
          { slug: "exterior", name: "Кузов" },
          { slug: "interior", name: "Салон" },
        ]}
        items={[
          { id: 1, category: "exterior", node: <p>polish</p> },
          { id: 2, category: "interior", node: <p>seats</p> },
        ]}
        labels={{ all: "Все", filter: "Фильтр" }}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    await userEvent.click(screen.getByRole("button", { name: "Салон" }));
    expect(screen.getByRole("button", { name: "Салон" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("polish")).toBeNull();
    expect(screen.getByText("seats")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Все" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
