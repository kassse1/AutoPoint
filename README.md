# AutoPoint

Website, booking system and admin panel for a premium car detailing studio in Astana
(demo brand). Built so it can be re-branded for other automotive businesses through
configuration.

> **Status: Phase 5 — Admin panel.** Public site (ru / kk / en), live price calculator,
> 7-step online booking with database-level double-booking protection, and the staff admin
> at `/admin`: dashboard, bookings (table + day calendar), customers, services and price
> matrix, discounts, staff and schedules, holidays, site settings, users, audit log.
> Telegram notifications and image uploads are Phase 6.
> Architecture and roadmap: [docs/PHASE-0-architecture.md](docs/PHASE-0-architecture.md).

## Stack

| Part | Tech |
|---|---|
| Web (`apps/web`) | Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS 4, next-intl, React Hook Form + Zod, TanStack Query (admin), lucide-react |
| API (`apps/api`) | Python 3.13, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, psycopg 3 |
| Database | PostgreSQL 18 |
| Tooling | uv, npm, Ruff, pytest, ESLint, Vitest, openapi-typescript, Docker Compose, GitHub Actions |

## Repository layout

```
apps/api      FastAPI app (app/), migrations (migrations/), tests (tests/), openapi.json
apps/web      Next.js: public site (src/app/[locale]/…), admin (src/app/admin/…), translations (messages/)
docs/         architecture and decisions
compose.yml   local stack: db, api, web
.github/      CI workflow
```

## Quick start (Docker)

Prerequisites: Docker Desktop.

```bash
docker compose up -d --build --wait
```

- Website: http://localhost:3000 (ru), http://localhost:3000/kk, http://localhost:3000/en
- API health: http://localhost:8000/health/ready
- API docs (non-production only): http://localhost:8000/api/docs

The dev stack applies migrations and loads the **demo seed** on start (skipped if the
database is already configured). If port 8000 is taken on your machine, set `API_PORT` in
`.env` (copy `.env.example`).

## Local development (without containers for api/web)

Prerequisites: Python 3.13 + [uv](https://docs.astral.sh/uv/), Node.js 24, Docker (for Postgres).

```bash
docker compose up -d db
```

API (from `apps/api`):

```bash
uv sync
uv run alembic upgrade head
uv run python -m app.seed
uv run uvicorn app.main:app --reload --port 8000
```

Web (from `apps/web`; point it at the API if it isn't on port 8000):

```bash
npm install
API_INTERNAL_URL=http://localhost:8000 npm run dev
```

## Checks

API (from `apps/api`, needs the `db` container — tests create and use a separate
`<db>_test` database; destructive fixtures refuse to run against any other database):

```bash
uv run ruff check . && uv run ruff format --check . && uv run pytest
```

Web (from `apps/web`; the build does **not** need a running API):

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

After changing API schemas, regenerate the contract and the TS types (CI fails if they drift):

```bash
cd apps/api && uv run python -m app.openapi && cd ../web && npm run api:types
```

## How the website gets its data

- Pages are server-rendered from the API (`src/lib/api/client.ts`, server-side only) and
  cached for 60 s. Nothing is built ahead of time, so a deploy never depends on the API
  being up during the build.
- Business data (name, contacts, address, map links, hours, SEO title, brand colour, enabled
  languages) lives in the `business_settings` table and is validated by `SiteSettings`.
- Services, prices (integer KZT per vehicle class), options, gallery, reviews and team come
  from their tables. Translatable DB fields are JSON objects `{"ru", "kk", "en"}`; `ru` is
  required and is the fallback.
- Interface and marketing copy lives in `apps/web/messages/{ru,kk,en}.json`. Keys are
  type-checked: a missing or misspelled key fails `npm run typecheck`.

## Admin access

Admin panel: http://localhost:3000/admin (Russian; all texts are in `messages/ru.json` →
`Admin`, ready to translate).

**Demo accounts (development only).** `python -m app.seed` (run automatically by the dev
Docker stack) creates these when there are no users yet. Their password is public, so they
are **never** created with `ENVIRONMENT=production`:

| Email | Role | Password |
|---|---|---|
| owner@autopoint.demo | owner | `autopoint-demo-2026` |
| admin@autopoint.demo | admin | `autopoint-demo-2026` |
| manager@autopoint.demo | manager | `autopoint-demo-2026` |
| erlan@autopoint.demo | employee (master «Ерлан С.») | `autopoint-demo-2026` |

On a real install there are no default accounts. Create the first owner (the password is
asked interactively, or read from `AUTOPOINT_PASSWORD`):

```bash
docker compose exec api python -m app.manage create-user --email you@example.com --name "Your Name" --role owner
```

How login works:

- **Passwords:** hashed with Argon2id; 5 wrong attempts lock the account for 15 minutes,
  doubling up to 24 h (an admin can unlock it). Login is rate-limited per IP.
- **Tokens:** a 15-minute access JWT, sent as `Authorization: Bearer`, plus a refresh token
  in an `HttpOnly`, `SameSite=Strict` cookie that is only sent to `/api/v1/auth`.
- **Refresh:** each refresh replaces the refresh token. If an old token is used again,
  every session of that login is revoked. Refresh and logout also require the header
  `X-Requested-With: autopoint`.
- **Immediate effect:** logout, password change, deactivation and role changes apply at
  once. Every request checks the user and the login session in the database.

| Role | Can |
|---|---|
| owner | everything, including managing owners |
| admin | everything except creating, changing or demoting owners |
| manager | bookings, customers, schedules and holidays; read catalog, staff and settings |
| employee | only their own bookings: view, start (in progress) and finish (completed) |

Permissions are enforced in the API (`app/modules/auth/permissions.py`). A test walks every
admin route and checks it against every role.

## Configuration

API (`apps/api/app/config.py`, environment variables only):

| Variable | Default | Notes |
|---|---|---|
| `ENVIRONMENT` | `development` | `production` hides OpenAPI docs |
| `DATABASE_URL` | local compose db | `postgresql+psycopg://…` |
| `CORS_ORIGINS` | `[]` | JSON list; empty in production (same origin behind the proxy) |
| `LOG_LEVEL` | `INFO` | logs are JSON lines with `request_id` |
| `SECRET_KEY` | dev placeholder | signs booking manage links; the API refuses to start in production without a real 32+ character value |

Web:

| Variable | Default | Notes |
|---|---|---|
| `API_INTERNAL_URL` | `http://localhost:8000` | where the Next.js server reaches the API |
| `SITE_URL` | `http://localhost:3000` | canonical URLs, sitemap, Open Graph |

## Public API (v1)

Read: `GET /api/v1/public/…` — `site`, `service-categories`, `vehicle-categories`, `services`
(`?category=&featured=`), `services/{slug}`, `gallery` (`?category=&service=&kind=`),
`reviews`, `team`. Content endpoints take `?locale=ru|kk|en`.

Booking (rate-limited per client IP):

| Endpoint | What it does |
|---|---|
| `POST /quotes` | Price for `{service, vehicle, options[], addons[]}`: lines, best discount, total, duration. The only place prices are computed. |
| `GET /availability?service=&vehicle=&options=&addons=&date_from=&date_to=` | Free start times per day (≤ 31 days), as `2026-11-24T10:00:00+05:00` plus a `10:00` label |
| `POST /bookings` | Header `Idempotency-Key` (UUID). Re-checks price and availability, assigns an employee, returns the booking and a private manage token. 409 `SLOT_UNAVAILABLE` if taken. |
| `POST /bookings/lookup` · `POST /bookings/cancel` | With the manage token in the body (never in a URL). Customers can cancel until `cancel_cutoff_hours` before the start. |

### Admin API (Bearer token)

`/api/v1/auth/…` login, refresh, logout, logout-all, me, password, sessions ·
`/api/v1/admin/…` bookings (list with filters / detail with history / create / notes /
status / reschedule / assign), customers, service-categories, services, options, prices
(whole matrix per service), vehicle-categories, discount-rules, employees (+ skills,
weekly schedule), business-hours, schedule-exceptions, settings, users, audit-logs.
Full contract: `apps/api/openapi.json` or `/api/docs` in development.

Booking statuses: `pending → confirmed → in_progress → completed` (completion records the
amount actually charged), plus `cancelled` and `no_show` (only after the start time).
Every change is written to the audit log with the staff member who made it.

### How double booking is prevented

1. The availability engine (`app/modules/scheduling/engine.py`, pure functions) offers only
   starts where a qualified employee is free for the job plus the buffer.
2. On booking, everything is recomputed on the server; client prices are never accepted.
3. PostgreSQL has the final word: an exclusion constraint forbids overlapping active
   bookings for one employee. A concurrent loser gets 409. A test fires 20 simultaneous
   requests at one slot and asserts exactly one succeeds.

Booking rules (slot step, buffer, lead time, horizon, cancel cutoff, max active bookings per
phone) live in `business_settings.data.booking` with defaults in `BookingPolicy`.

Every error is `application/problem+json`: `{type, title, status, code, detail, request_id, errors[]}`;
every response carries `X-Request-ID`.

## Demo content — what is not real

The seed (`apps/api/app/seed.py`) is a **demo**. The site labels it as such:

- Contacts and address are placeholders (`+7 700 000 00 00`, `hello@example.com`, “Demo address”).
- Prices, durations, discounts (“Кузов + салон” −10 %, 3+ services −5 %) and staff
  schedules (Ерлан Mon–Fri 9–18, Дмитрий Tue–Sat 10–19) are examples.
- Reviews and team profiles are flagged `is_demo` and show a “Demo” badge. No rating
  markup (JSON-LD) is ever produced from them.
- There are no photos yet: images render as a labelled line-art illustration until real
  photos are uploaded (upload arrives with the admin panel).
- The privacy policy is a template and must be reviewed by a lawyer.
- Kazakh (`kk`) texts are drafts and need review by a native speaker.

## Notes

- Business timezone is `Asia/Almaty` (UTC+5 since 2024); the API pins the `tzdata` package.
