/**
 * Admin API client. The access token lives only in memory (never in storage); the refresh
 * token is an HttpOnly cookie the browser sends to /api/v1/auth only.
 */
import type { components } from "@/lib/api/schema";

type S = components["schemas"];
export type Me = S["MeOut"];
export type BookingRow = S["BookingRow"];
export type BookingDetail = S["BookingDetail"];
export type BookingsPage = S["Page_BookingRow_"];
export type CustomersPage = S["Page_CustomerRow_"];
export type CustomerDetail = S["CustomerDetail"];
export type AuditPage = S["Page_AuditOut_"];
export type Summary = S["Summary"];
export type AdminService = S["ServiceOut"];
export type AdminCategory = S["AdminCategory"];
export type AdminOption = S["AdminOption"];
export type PriceMatrix = S["PriceMatrix"];
export type Vehicle = S["VehicleOut"];
export type Discount = S["DiscountRuleOut"];
export type Employee = S["EmployeeOut"];
export type Interval = S["Interval"];
export type ScheduleException = S["ExceptionOut"];
export type SiteSettings = S["SiteSettings"];
export type User = S["UserOut"];

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public detail: string | null,
    public fields: { field: string; code: string }[],
  ) {
    super(code);
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
const SAME_SITE = { "X-Requested-With": "autopoint" };

/** Get a new access token from the refresh cookie. One refresh at a time, across all tabs:
 * the refresh token rotates, and sending an already-used one would end the login. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const run = async () => {
      const res = await fetch("/api/v1/auth/refresh", { method: "POST", headers: SAME_SITE });
      if (!res.ok) {
        accessToken = null;
        return false;
      }
      accessToken = (await res.json()).access_token;
      return true;
    };
    return typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request("autopoint-refresh", run)
      : run();
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function api<T>(
  path: string,
  init: Omit<RequestInit, "body"> & { json?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const { json, idempotencyKey, ...rest } = init;
  const send = () =>
    fetch(`/api/v1${path}`, {
      ...rest,
      body: json === undefined ? undefined : JSON.stringify(json),
      headers: {
        ...(json === undefined ? {} : { "Content-Type": "application/json" }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        ...rest.headers,
      },
    });
  let res = await send();
  if (res.status === 401 && !path.startsWith("/auth/login") && (await refreshSession())) {
    res = await send();
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.code ?? "UNKNOWN", data?.detail ?? null, data?.errors ?? []);
  }
  return data as T;
}

export async function signIn(email: string, password: string): Promise<void> {
  const data = await api<S["TokenOut"]>("/auth/login", { method: "POST", json: { email, password } });
  accessToken = data.access_token;
}

export async function signOut(): Promise<void> {
  await fetch("/api/v1/auth/logout", { method: "POST", headers: SAME_SITE }).catch(() => undefined);
  accessToken = null;
}

export const hasAccessToken = () => accessToken !== null;

/** Times come from the API with the business offset (e.g. "2026-11-24T10:00:00+05:00"):
 * show them as written instead of converting through the browser's timezone data. */
export const localDate = (iso: string) => iso.slice(0, 10);
export const localTime = (iso: string) => iso.slice(11, 16);

/** "2026-11-24" + "10:00" in Asia/Almaty → "2026-11-24T10:00:00+05:00". */
export function almatyIso(date: string, time: string, timeZone = "Asia/Almaty"): string {
  const probe = new Date(`${date}T${time}:00Z`);
  const offset =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(probe)
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "") || "+00:00";
  return `${date}T${time}:00${offset}`;
}
