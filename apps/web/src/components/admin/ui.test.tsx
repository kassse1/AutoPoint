import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nInputs } from "./ui";

describe("I18nInputs", () => {
  it("requires Russian for required texts only", () => {
    render(
      <>
        <I18nInputs id="name" label="Name" value={{}} onChange={() => {}} />
        <I18nInputs id="caption" label="Caption" value={{}} onChange={() => {}} required={false} />
      </>,
    );
    expect((screen.getByLabelText(/^ru/, { selector: "#name-ru" }) as HTMLInputElement).required).toBe(true);
    expect((document.getElementById("caption-ru") as HTMLInputElement).required).toBe(false);
    expect((document.getElementById("name-en") as HTMLInputElement).required).toBe(false);
  });
});
