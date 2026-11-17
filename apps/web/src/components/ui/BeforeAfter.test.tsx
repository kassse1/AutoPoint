import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BeforeAfter } from "./BeforeAfter";

describe("BeforeAfter", () => {
  // jsdom has no native arrow-key stepping for range inputs; that part is checked in a browser.
  it("is a labelled slider whose value moves the before layer", () => {
    render(
      <BeforeAfter before={<p>dirty</p>} after={<p>clean</p>} beforeLabel="До" afterLabel="После" sliderLabel="Сравнение" />,
    );
    const slider = screen.getByRole("slider", { name: "Сравнение" });
    const layer = screen.getByTestId("before-layer");
    expect(layer.style.clipPath).toBe("inset(0px 50% 0px 0px)");

    fireEvent.change(slider, { target: { value: "52" } });
    expect(slider).toHaveProperty("value", "52");
    expect(layer.style.clipPath).toBe("inset(0px 48% 0px 0px)");
    expect(slider.getAttribute("aria-valuetext")).toBe("52%");
  });
});
