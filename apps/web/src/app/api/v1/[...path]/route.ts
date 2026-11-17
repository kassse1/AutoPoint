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
// The API's own limit is 1 MB for JSON and ~10 MB for uploads; this stops bigger bodies
// before they are buffered in memory here.
const MAX_BODY = 11 * 1024 * 1024;
const RESPONSE_HEADERS = [
  "content-type",
  "x-request-id",
  "retry-after",
  "www-authenticate",
  "cache-control",
  "etag",
  "last-modified",
  "x-content-type-options",
];

async function forward(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const length = request.headers.get("content-length");
  if (request.headers.get("transfer-encoding")) return tooLarge(411, "LENGTH_REQUIRED");
  if (length && Number(length) > MAX_BODY) return tooLarge(413, "PAYLOAD_TOO_LARGE");

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
    // Raw bytes, not text: image uploads are binary multipart bodies.
    body: request.method === "GET" || !length ? undefined : await request.arrayBuffer(),
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

function tooLarge(status: number, code: string) {
  return Response.json(
    { type: "about:blank", title: status === 413 ? "Content Too Large" : "Length Required", status, code },
    { status, headers: { "content-type": "application/problem+json" } },
  );
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
