import { describe, expect, it } from "vitest";
import { contactFormSchema } from "./ContactForm";

const valid = { name: "Мадина", phone: "8 701 777 66 55", email: "", message: "Сколько стоит керамика?", consent: true as const, website: "" };

describe("contactFormSchema", () => {
  it("accepts a normal message", () => {
    expect(contactFormSchema.safeParse(valid).success).toBe(true);
  });
  it("returns translation keys for each problem", () => {
    const r = contactFormSchema.safeParse({ ...valid, name: "M", phone: "1", email: "x@", message: "hi", consent: false });
    const keys = Object.fromEntries((r.error?.issues ?? []).map((i) => [String(i.path[0]), i.message]));
    expect(keys).toEqual({ name: "nameTooShort", phone: "phoneInvalid", email: "emailInvalid", message: "messageTooShort", consent: "consentRequired" });
  });
});
