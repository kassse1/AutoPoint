import type { NextRequest } from "next/server";

// Same-origin bridge from the browser to FastAPI, so the site needs no CORS and no API URL
// baked in at build time. In production the reverse proxy (Caddy) routes /api straight to
// FastAPI and this handler is never reached.
const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:8000";
const REQUEST_HEADERS = [
  "content-type",
  "idempotency-key",
  "x-request-id",
  "x-forwarded-for",
  "authorization",
  "x-requested-with",
  "cookie", // the refresh cookie (path /api/v1/auth) for the admin login
];
const RESPONSE_HEADERS = ["content-type", "x-request-id", "retry-after", "www-authenticate"];

async function forward(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const url = new URL(`/api/v1/${path.map(encodeURIComponent).join("/")}`, API_URL);
  url.search = request.nextUrl.search;

  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const upstream = await fetch(url, {
    method: request.method,
    headers,
    body: request.method === "GET" ? undefined : await request.text(),
    cache: "no-store",
  });

  const out = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  for (const cookie of upstream.headers.getSetCookie()) out.append("set-cookie", cookie);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
