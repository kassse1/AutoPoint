import { afterEach, describe, expect, it, vi } from "vitest";
import { almatyIso, api, ApiError, localDate, localTime } from "./api";
import { fromGrid, stepsToText, textToList, textToSteps, toGrid } from "./matrix";
import { nextStatuses } from "./status";

describe("nextStatuses (mirrors the API state machine)", () => {
  const manager = { manage: true, cancelInProgress: false, started: false };
  it("offers the next steps for staff", () => {
    expect(nextStatuses("pending", manager).map((a) => a.status)).toEqual(["confirmed", "cancelled"]);
    expect(nextStatuses("confirmed", manager).map((a) => a.status)).toEqual(["in_progress", "cancelled"]);
    expect(nextStatuses("confirmed", { ...manager, started: true }).map((a) => a.status)).toContain("no_show");
    expect(nextStatuses("completed", manager)).toEqual([]);
  });
  it("lets employees only start and finish, and only owners/admins cancel a job in progress", () => {
    const employee = { manage: false, cancelInProgress: false, started: true };
    expect(nextStatuses("confirmed", employee).map((a) => a.status)).toEqual(["in_progress"]);
    expect(nextStatuses("in_progress", employee).map((a) => a.status)).toEqual(["completed"]);
    expect(nextStatuses("in_progress", manager).map((a) => a.status)).toEqual(["completed"]);
    expect(nextStatuses("in_progress", { ...manager, cancelInProgress: true }).map((a) => a.status)).toEqual(["completed", "cancelled"]);
  });
  it("asks for the charged amount on completion and a reason on cancel", () => {
    const [complete] = nextStatuses("in_progress", manager);
    expect(complete).toEqual({ status: "completed", needsAmount: true, needsReason: false });
  });
});

describe("price matrix grid", () => {
  const matrix = {
    entries: [
      { option_code: null, vehicle_code: "sedan", price_kzt: 180000, duration_min: 480 },
      { option_code: "two_layers", vehicle_code: "sedan", price_kzt: 60000, duration_min: 240 },
    ],
  };
  it("round-trips and treats an empty price as 'not offered'", () => {
    const grid = toGrid(matrix, ["", "two_layers"], ["sedan", "suv"]);
    expect(grid[""].suv).toEqual({ price: "", minutes: "" });
    expect(fromGrid(grid)).toEqual(matrix);
    grid[""].suv = { price: "234000", minutes: "575" };
    expect(fromGrid(grid).entries).toContainEqual({ option_code: null, vehicle_code: "suv", price_kzt: 234000, duration_min: 575 });
  });
  it("converts process steps and lists from the editor's text form", () => {
    expect(textToSteps("Мойка | Ручная мойка\nбез разделителя\n Сушка |  Микрофибра ")).toEqual([
      { title: "Мойка", text: "Ручная мойка" },
      { title: "Сушка", text: "Микрофибра" },
    ]);
    expect(stepsToText([{ title: "A", text: "B" }])).toBe("A | B");
    expect(textToList(" a \n\n b ")).toEqual(["a", "b"]);
  });
});

describe("business time helpers", () => {
  it("reads API times as written and builds Astana timestamps (UTC+5)", () => {
    expect(localDate("2026-11-24T10:00:00+05:00")).toBe("2026-11-24");
    expect(localTime("2026-11-24T10:00:00+05:00")).toBe("10:00");
    expect(almatyIso("2026-11-24", "10:00")).toBe("2026-11-24T10:00:00+05:00");
  });
});

describe("api client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("refreshes once for many simultaneous 401s, then retries each request", async () => {
    let refreshes = 0;
    let token = "";
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/auth/refresh")) {
        refreshes += 1;
        await new Promise((r) => setTimeout(r, 10));
        token = "fresh";
        return new Response(JSON.stringify({ access_token: "fresh" }), { status: 200 });
      }
      const auth = new Headers(init?.headers).get("authorization");
      return auth === `Bearer ${token}` && token
        ? new Response(JSON.stringify({ ok: url }), { status: 200 })
        : new Response(JSON.stringify({ code: "UNAUTHENTICATED" }), { status: 401 });
    }));
    const results = await Promise.all([api("/admin/a"), api("/admin/b"), api("/admin/c")]);
    expect(refreshes).toBe(1);
    expect(results).toHaveLength(3);
  });

  it("turns problem responses into ApiError with the code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ code: "SLOT_UNAVAILABLE", detail: "x", errors: [] }), { status: 409 })));
    await expect(api("/admin/bookings/1/reschedule", { method: "POST", json: {} })).rejects.toMatchObject({
      status: 409,
      code: "SLOT_UNAVAILABLE",
    });
    await expect(api("/x")).rejects.toBeInstanceOf(ApiError);
  });
});
