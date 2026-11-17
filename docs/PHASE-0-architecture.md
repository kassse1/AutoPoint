# AutoPoint — Phase 0: Discovery & Architecture

Status: **draft for approval** · Date: 2026-11-17 · No application code has been written.

---

## 0. Working directory inspection

| Check | Result |
|---|---|
| Folder `C:\Users\Erasyl\Desktop\Новая папка (2)` | Empty (only this `docs/` folder now) |
| Git repository | No |
| Python | 3.13.14 ✅ (spec: 3.13+) |
| uv | 0.11.28 ✅ (will manage Python deps) |
| Node / npm | 24.22.1 / 11.19.1 ✅ (pnpm not installed → use npm) |
| Docker | 29.9.2 ✅ |
| Git | 2.56.0 ✅ |

Nothing to overwrite. Two things to decide before Phase 1 (see §12): `git init`, and moving the
project to a path without Cyrillic/spaces/parentheses (e.g. `C:\dev\autopoint`). Such paths
regularly break Docker bind mounts on Windows, some npm scripts and Playwright browser paths.

---

## 1. Product requirements document

### 1.1 Goal
A production-grade website + booking system + admin panel for one premium detailing studio
(demo brand **AutoPoint**, Astana), built so another automotive business can be launched by
changing configuration, content and images — not code.

### 1.2 Users
| Persona | Needs |
|---|---|
| **Customer** (private / premium car owner) | Understand services and real price range for *their* car, trust the studio, book a slot in < 2 min from a phone, contact via WhatsApp/Telegram/phone. |
| **Owner** | See bookings and recorded revenue, control prices, staff, users, settings; trust that nothing is double-booked. |
| **Admin / Manager** | Confirm, reschedule, assign, cancel bookings; manage customers, schedules, gallery, services. |
| **Employee (master)** | See own schedule, mark own jobs in progress / completed. |

### 1.3 In scope (MVP = one business)
1. Public site: Home, Services, Service detail, Gallery, About, Contacts, Booking wizard, Booking confirmation/manage page, Privacy policy, 404/500.
2. Price calculator: backend-computed quotes from an admin-editable price matrix (service × vehicle category), service options, add-ons and discount rules.
3. Booking engine: business hours, employee schedules, exceptions/holidays, buffers, lead time, horizon; DB-enforced no-double-booking; statuses; cancel; reschedule; history.
4. Admin app at `/admin`: dashboard, bookings (table + calendar), services & pricing, staff & schedules, customers, gallery, reviews, settings, users, audit log, notification outbox, contact messages.
5. Auth: Argon2id, 15-min access JWT, rotating refresh sessions with reuse detection, logout/revoke, RBAC (owner/admin/manager/employee) enforced in the API.
6. Integrations: Telegram staff notifications via DB outbox + worker; WhatsApp/Telegram/phone deep links; contact form with spam protection and rate limiting.
7. i18n: ru (default, no prefix), kk, en. Localized UI, validation, dates (Asia/Almaty), KZT currency.
8. SEO: SSR/ISR, metadata, OG, sitemap with hreflang, robots, canonical, JSON-LD (`AutomotiveBusiness`, `Service`, `Offer`, `BreadcrumbList`).
9. Docker Compose (dev + prod), GitHub Actions CI, tests (pytest, Vitest, Playwright), JSON logs, health checks, docs, demo seed.

### 1.4 Explicitly out of scope (MVP)
Online payments; customer accounts; multi-tenant SaaS / billing; WhatsApp Business API; SMS;
customer-facing Telegram bot; customer self-reschedule (customer can **cancel** via secure link; reschedule goes through staff); promo codes; 2FA (TOTP is the first post-MVP security item); bay/box capacity as a second resource (see §10); review import from Google/2GIS; blog.

### 1.5 Honesty rules (non-negotiable)
- Seed reviews, team profiles, gallery items carry `is_demo = true` and render a visible **"Демо / Demo"** badge. No `AggregateRating` JSON-LD is ever emitted from demo reviews.
- No counters like "5000+ cars" unless entered by the business in settings; none are seeded.
- Revenue = sum of `final_amount_kzt` on **completed** bookings, entered by staff on completion. Labelled "Recorded revenue". With `DEMO_MODE=true` the admin shows a persistent "Demo data" banner.
- Integrations show their real state: Telegram "not configured" if no token; nothing pretends to send.

---

## 2. Main user journeys

**J1 — Customer books from Instagram link (mobile, primary journey)**
Home → hero "Записаться" → Booking: service → vehicle category → options/add-ons (live backend quote, sticky price bar) → date + slot (only server-computed slots) → name, phone, optional car model/comment, personal-data consent → review → confirm → confirmation page with reference `AP-7K3F9Q`, summary, "add to calendar" (.ics), WhatsApp/Telegram links and a private manage link.
Failure paths: slot taken meanwhile → 409, wizard returns to step 4 with fresh slots and a clear message; validation errors inline, localized; network error → retry, idempotency key prevents duplicates.

**J2 — Customer researches price**
Services → service card ("от 45 000 ₸ · 3–4 ч") → service page: price table by vehicle category, what's included, process, gallery, related services → "Рассчитать и записаться" pre-selects the service in the wizard.

**J3 — Customer contacts instead of booking**
Any page → floating/footer WhatsApp (prefilled "Здравствуйте! Интересует {service}") / Telegram / tel: link, or Contacts form → staff gets Telegram notification.

**J4 — Customer cancels**
Manage link (`/booking/manage#<token>`) → sees summary → "Cancel" (allowed until `cancel_cutoff_hours` before start) → slot is released, staff notified.

**J5 — Manager processes a new request**
Telegram "New booking AP-7K3F9Q, Керамика, 21 Nov 10:00 → open in admin" → admin booking detail → call/WhatsApp customer → Confirm (or reassign employee / reschedule) → status history updated, audit log written, Telegram notification.

**J6 — Manager handles a phone booking** — Admin → Bookings → New → same engine/availability as public.

**J7 — Employee works the day** — Login → "My bookings today" → In progress → Completed (enters final amount if permitted, else manager does).

**J8 — Owner adjusts business** — Pricing matrix edit → public prices/quotes change (ISR ≤ 60 s); add holiday exception → slots disappear; view dashboard & audit log.

**J9 — Agency launches for a new client** — Clone repo → edit `.env`, settings (name, logo, colors, contacts, hours, languages), `messages/*.json` marketing copy, seed real services/prices via admin, upload images → deploy.

---

## 3. Information architecture & page list

### 3.1 Public (localized: `/` = ru, `/kk/...`, `/en/...`)
Same English path segments in every locale (no Cyrillic slugs → clean sharing, simple routing); `hreflang` alternates on every page.

| Route | Rendering | Content |
|---|---|---|
| `/` | ISR 60 s | Hero, featured services, before/after, why us, process, reviews (demo-badged), FAQ, location & hours, CTA |
| `/services` | ISR | Categories (tabs/anchors), service cards: image, from-price, duration, short description |
| `/services/[slug]` | ISR (on-demand params) | Description, gallery, benefits, included, process, price-by-vehicle table, options, related, CTA |
| `/gallery` | ISR | Category filter, before/after comparisons, masonry grid, lightbox |
| `/about` | ISR | Studio, standards & workflow, team (demo-badged), studio gallery |
| `/contacts` | ISR | Address, lazy map, hours, phone/WhatsApp/Telegram, contact form |
| `/booking` | Client wizard (shell SSR) | 7-step wizard; `?service=slug` preselect |
| `/booking/success` | Client | Reference, summary, .ics, contact links (data from the create response) |
| `/booking/manage` | Client | Token in URL **fragment** (never sent to server logs), lookup + cancel |
| `/privacy` | Static | Privacy policy template (must be reviewed by a lawyer) |
| `sitemap.xml`, `robots.txt`, `not-found`, `error` | — | — |

Header: logo, Services, Gallery, About, Contacts, language switcher, phone, **Book** button. Mobile: full-screen menu + sticky bottom bar (Call · WhatsApp · Book).

### 3.2 Admin (`/admin`, not indexed, client-rendered, ru default with en/kk message files)
Login · Dashboard · Bookings (table / calendar day-by-employee / week) · Booking detail · New booking · Customers · Customer detail · Services · Service edit (content, options, price matrix) · Vehicle categories · Discounts · Staff · Employee edit (profile, skills, weekly schedule, exceptions) · Business hours & holidays · Gallery · Reviews · Contact messages · Notifications (outbox) · Settings · Users & sessions · Audit log · Profile (password, my sessions).

---

## 4. Design system proposal

### 4.1 Direction
"Editorial automotive": dark studio, cars as the hero, typography doing the luxury work, gold used like
a jeweller — sparingly (CTAs, rules, numerals, focus). Inspired by premium car-brand sites and
print magazines, not SaaS. Full-bleed photography, asymmetric editorial grids, thin 1px rules,
small radii.

### 4.2 Tokens (CSS variables in Tailwind v4 `@theme`; brand values overridable from settings at runtime)
| Token | Value | Use |
|---|---|---|
| `--bg` | `#0D0D0E` | Page |
| `--surface` / `--surface-2` | `#151517` / `#1C1C1F` | Cards, inputs |
| `--line` | `#2A2A2E` | 1px borders, rules |
| `--fg` | `#F3EFE8` warm white | Body/headlines |
| `--fg-muted` | `#A7A198` | Secondary text (≥ 7:1 on bg) |
| `--accent` | `#C3A46C` muted brass/gold | CTAs, highlights, focus ring |
| `--accent-fg` | `#0D0D0E` | Text on accent |
| `--success` / `--warning` / `--danger` | `#7FA38A` / `#D2A65A` / `#C9665B` | Status (muted, never neon) |
| Radius | `2px` controls, `4px` cards, `999px` only pills/badges | No big rounded cards |
| Spacing | 4px base; section padding 96–160 px desktop, 64–96 px mobile | |
| Container | 1320 px max, 12-col grid, 24 px gutters (16 px mobile) | |
| Shadow | none on dark; elevation via surface + line | |

Admin uses the same tokens with a denser scale and a neutral (non-cinematic) layout.
All colour pairs are checked for WCAG AA in Phase 2 (automated contrast test).

### 4.3 Typography
- **Display:** Inter Tight (600/700, tight tracking) — clean, automotive, wide Cyrillic support.
- **Text/UI:** Inter (400/500/600), tabular numerals for prices and times.
- **Labels:** uppercase, +12% tracking, 12–13 px — the "luxury" cue.
- Scale (desktop): 72/56/40/28/20/17/15/13; fluid via `clamp()`.
- Loaded with `next/font` (self-hosted, no layout shift), subsets `latin`, `cyrillic`, `cyrillic-ext`.
- **Must verify in Phase 2:** Kazakh glyphs `Ә ә Ғ ғ Қ қ Ң ң Ө ө Ұ ұ Ү ү Һ һ І і` render in both families (a fixture page + visual check). Fallback candidate: Golos Text.

### 4.4 Components (reusable, in `components/ui` and `components/sections`)
Button (primary gold / secondary outline / ghost / link) · IconButton · Badge (incl. `DemoBadge`) · Input/Textarea/Select/PhoneInput/Checkbox/RadioCard · FormField (label, hint, error, `aria-describedby`) · Stepper · PriceSummary · SlotPicker (day strip + time grid) · ServiceCard · BeforeAfter (accessible range slider, keyboard + touch) · Gallery grid + Lightbox (focus-trapped) · SectionHeader (eyebrow, title, lead) · FAQ accordion (native `<details>`) · Map (click-to-load) · Toast · Dialog/Sheet · Skeletons · EmptyState. Admin adds DataTable (TanStack Table), Calendar, StatCard, Filters.
Icons: **Lucide** (1.5 px stroke). No emoji.

### 4.5 Motion (Framer Motion, only where it helps)
Section reveal (opacity + 8 px rise, 400 ms, once) · hero image slow scale-in · wizard step transitions (slide 16 px, 250 ms) · price total number tween · before/after handle. Everything respects `prefers-reduced-motion` (motion disabled, content visible). No parallax scroll-jacking, no autoplay carousels.

### 4.6 Imagery
Full-bleed 16:9/21:9 hero, 4:5 service cards, before/after pairs at identical framing. `next/image`
with AVIF/WebP, `sizes`, blur placeholder, `priority` only for the hero.
**Source decision required (§12):** free-licence stock (Unsplash/Pexels licences allow commercial use; credits recorded in `docs/image-credits.md`) or your own photos. Stock "before/after" pairs barely exist; any pair we fabricate would be labelled "Иллюстрация (демо)".

---

## 5. Technical architecture

### 5.1 Overview
```
                    ┌───────────────────────── Caddy (TLS, headers, gzip, body limit) ─┐
Browser ──HTTPS──▶  │  /api/*  ──▶  api (FastAPI, uvicorn)  ──┐                        │
                    │  /media/* ──▶  static files (uploads volume)                      │
                    │  /*       ──▶  web (Next.js server)  ──server fetch──▶ api        │
                    └──────────────────────────────────────────┼──────────────────────┘
                                                                ▼
                         worker (same Python codebase) ──▶ PostgreSQL ◀── api
                               │ outbox poll (SKIP LOCKED)
                               ▼
                         Telegram Bot API
```
- **Same origin** in production (Caddy path routing) → no CORS in prod, cookies `SameSite=Strict` work, simpler CSP. Dev: Next on :3000, API on :8000, CORS allowlist = `http://localhost:3000`.
- **Modular monolith**, one Postgres, one Python codebase run as two processes (`api`, `worker`). No microservices, no message broker.

### 5.2 Redis — not in MVP (justification)
| Would-be use | Chosen instead | Why |
|---|---|---|
| Rate limiting | `UNLOGGED` Postgres counter table, one `INSERT … ON CONFLICT DO UPDATE … RETURNING` per limited request | Correct across workers, zero new infra; traffic is tiny |
| Job queue | Postgres outbox + `FOR UPDATE SKIP LOCKED` worker | Transactional with the booking; at-least-once |
| Cache | Next.js ISR / fetch cache | Public pages are already cached |
Upgrade trigger: > ~200 req/s sustained on limited endpoints or several app hosts.

### 5.3 Repository layout
```
autopoint/
├─ apps/
│  ├─ api/                     FastAPI (uv project)
│  │  ├─ app/
│  │  │  ├─ main.py            app factory, middleware, error handlers
│  │  │  ├─ config.py          pydantic-settings
│  │  │  ├─ db.py              engine/session, transaction helper
│  │  │  ├─ core/              security (jwt, argon2), permissions, rate limit, errors, logging, i18n fallback
│  │  │  ├─ modules/
│  │  │  │  ├─ auth/           users, sessions
│  │  │  │  ├─ catalog/        categories, services, options, vehicle categories
│  │  │  │  ├─ pricing/        price matrix, discounts, quote engine (pure functions)
│  │  │  │  ├─ scheduling/     hours, schedules, exceptions, availability engine (pure functions)
│  │  │  │  ├─ bookings/       create/reschedule/status, references, manage tokens
│  │  │  │  ├─ customers/
│  │  │  │  ├─ staff/
│  │  │  │  ├─ media/          uploads, gallery, reviews
│  │  │  │  ├─ site/           business settings, contact messages
│  │  │  │  ├─ notifications/  outbox, telegram client, worker loop
│  │  │  │  ├─ audit/
│  │  │  │  └─ analytics/
│  │  │  └─ worker.py
│  │  ├─ migrations/           Alembic
│  │  ├─ seed/                 demo seed (idempotent)
│  │  └─ tests/                unit/, integration/ (real Postgres)
│  └─ web/                     Next.js (npm)
│     ├─ src/app/[locale]/(site)/…   public pages
│     ├─ src/app/admin/…             admin app (outside locale routing)
│     ├─ src/components/{ui,sections,admin}/
│     ├─ src/lib/api/                generated OpenAPI types + typed fetch client
│     ├─ messages/{ru,kk,en}.json
│     ├─ e2e/                        Playwright
│     └─ tests (colocated *.test.tsx, Vitest)
├─ deploy/  Caddyfile, compose.prod.yml, backup script
├─ docs/    architecture, ADRs, guides
├─ compose.yml  (dev: postgres + optional api/worker/web)
└─ .github/workflows/ci.yml
```
Each backend module = `router.py` (HTTP), `schemas.py` (Pydantic in/out), `service.py` (business logic + transactions), `models.py` (SQLAlchemy). No repository layer on top of SQLAlchemy — the session is the repository.

### 5.4 Key technology decisions
| Area | Decision | Trade-off |
|---|---|---|
| Frontend | Next.js (latest stable at Phase 1, App Router), React 19, TS strict, Tailwind v4, Framer Motion, next-intl, React Hook Form + Zod | — |
| Admin | **Same Next.js project**, separate `/admin` route tree, own layout, client-rendered | One build/deploy and shared tokens vs. a separate app's stronger isolation. Next code-splits per route, so public bundles don't ship admin code. Security does not depend on it — the API enforces everything. |
| Admin data | TanStack Query + TanStack Table; calendar built in-house (day view = columns per employee, week view) | FullCalendar's resource views are commercially licensed; our needs are narrow |
| API types | `openapi-typescript` generates TS types from FastAPI's OpenAPI; CI fails if generated file is stale | One source of truth for contracts |
| Backend | Python 3.13, FastAPI, Pydantic v2, **SQLAlchemy 2 sync** + **psycopg 3** (same driver for app and Alembic), Alembic | *Changed in Phase 1 (was async):* psycopg's async mode can't run on Windows' default event loop, and sync endpoints in FastAPI's threadpool are simpler to write and test. Traffic of one studio is far below the threadpool limit. |
| DB | PostgreSQL 18 (17 acceptable), extensions `btree_gist`, `citext` | — |
| Money | `integer` KZT everywhere, `CHECK (>= 0)`; integer math only; percent discounts `floor` | — |
| Time | `timestamptz` (UTC) everywhere; local wall-clock only in schedule tables (`time`, `date`) interpreted in `settings.timezone` = `Asia/Almaty` | see §10 tzdata risk |
| Content i18n in DB | `jsonb` per translatable field: `{"ru": "...", "kk": "...", "en": "..."}`, `CHECK (field ? 'ru')`; API resolves `?locale=` with fallback → ru | Simpler than translation tables; no per-language indexing needed |
| UI copy i18n | `messages/*.json` incl. marketing copy (hero, why-us, process, FAQ) | Copy changes need a redeploy; acceptable for agency-customised installs, keeps admin small |
| Business config | single-row `business_settings.data jsonb`, validated by a Pydantic model (name, logo, colours, contacts, address, coordinates, socials, SEO defaults, enabled locales, booking policy) | Flexible for resale; schema lives in code, versioned by migrations |
| Pricing on the client | Frontend calls `POST /quotes` (debounced ~150 ms); **no second pricing engine in TS** | Tiny latency vs. two engines drifting |
| Images | Local volume `/data/media`, served by Caddy; uploads re-encoded to WebP by Pillow; `next/image` optimises | S3-compatible storage is the upgrade path (only the media module changes) |
| Maps | OpenStreetMap embed (no API key), click-to-load + "Open in 2GIS / Yandex / Google" deep links from coordinates | 2GIS is what Astana users actually use; deep links give that without API keys |
| Logging | stdlib `logging` + JSON formatter, request-id middleware, PII redaction filter | no extra dependency |
| Background | `worker.py` loop: outbox dispatch, rate-limit table cleanup, expired refresh-session cleanup | — |
| Lint/test | Ruff (incl. `S` bandit rules) + pytest; ESLint + `tsc --noEmit` + Vitest + Playwright | No mypy in MVP: Pydantic/SQLAlchemy typing + tests cover most of it; can be added later |

### 5.5 Booking engine design
**Bookable resource = employee (master).** Every active booking holds exactly one employee. The
customer does not pick a master; the engine auto-assigns a qualified free one (fewest minutes booked that day, then sort order). Staff can reassign.

**Duration & end time.** `duration = Σ price_entries.duration_min` for service + options + add-ons for the vehicle category.
The end time is found by **walking the employee's working intervals**, consuming working minutes —
so a 16-hour PPF job starting Tue 10:00 ends Thu 12:00 and naturally spans nights/closed days.
`blocked_until = ends_at + buffer_min` (setting, snapshotted per booking).

**Working intervals** for an employee on a date =
`(business_hours or business exception) ∩ (employee_schedule or employee exception)`; a closed exception on either side → no time.

**Availability** (`GET /availability`) for a date range (≤ 31 days):
1. Load qualified employees (`employee_services`), their schedules/exceptions, business hours/exceptions, and active bookings overlapping the range (+ max job length).
2. Candidate starts every `slot_step_min` (setting, default 30) inside working intervals, ≥ `now + lead_time`, ≤ `now + horizon_days`.
3. A start is available if **some** qualified employee can complete the walk without overlapping their existing `[starts_at, blocked_until)` ranges.
4. Return per local date: `[{start: "2026-11-21T10:00:00+05:00", label: "10:00"}]` — labels computed server-side (authoritative tzdata).
Pure function, no DB inside → exhaustively unit-testable.

**Double-booking prevention (DB is the final authority):**
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (employee_id WITH =, tstzrange(starts_at, blocked_until, '[)') WITH &&)
  WHERE (status IN ('pending','confirmed','in_progress'));
```
**Create flow** (one transaction, `READ COMMITTED`):
1. Validate input; normalise phone (`phonenumbers`, default region KZ); check idempotency key → return the existing booking if seen.
2. Recompute quote from DB prices (client prices are never accepted).
3. Recompute availability for that exact start; build ordered candidate employees.
4. For each candidate: `SAVEPOINT; INSERT booking …` → on SQLSTATE `23P01` (exclusion violation) roll back to savepoint and try the next.
5. None left → `409 SLOT_UNAVAILABLE` (wizard refetches slots).
6. Upsert customer by phone (never overwrites an existing customer's name from a public request — the booking keeps its own snapshot), insert items with price snapshots, insert audit row, insert outbox row → `COMMIT`.
Reschedule/reassign/status-reactivation run the same check; cancel/no_show/completed release the range automatically (partial constraint).

**Status machine** (enforced in service layer + tested):
```
pending ─▶ confirmed ─▶ in_progress ─▶ completed (requires final_amount_kzt)
   │            │             │
   ├──▶ cancelled ◀──────────┘ (in_progress → cancelled: owner/admin only)
   └──▶ (confirmed) ─▶ no_show (only after starts_at)
```
Customer cancel via manage token: `pending|confirmed` and before `starts_at - cancel_cutoff_hours`.

### 5.6 Pricing engine
```
line(service, vehicle)  = P[service, ∅, vehicle] + Σ P[service, option, vehicle]  (selected options)
subtotal                = line(primary) + Σ line(addon)
discount                = best single applicable active rule:
                            bundle      — all required services present
                            min_services— ≥ N services in booking
                          amount = percent ? floor(subtotal·pct/100) : min(amount_kzt, subtotal)
total                   = subtotal − discount
```
Validation: service active and priced for the vehicle category; options belong to the service; at most one option per `group_code`; group defaults applied; add-ons must be `addon_eligible` and ≠ primary.
Response includes line items, discount (name + amount), total, total duration, and localized disclaimers ("Предварительная стоимость. Итоговая цена после осмотра автомобиля."). Prices displayed with `Intl.NumberFormat(locale, {style:'currency', currency:'KZT', maximumFractionDigits:0})`.
"From" price on cards = `min` over vehicle categories (computed by API).

### 5.7 Auth design
- `POST /auth/login` → Argon2id verify (argon2-cffi, OWASP params), per-account failed counter + progressive lockout, per-IP rate limit, generic error.
- Returns **access JWT** (HS256, 15 min, claims `sub`, `role`, `sid`, `exp`, `iat`, `jti`) in JSON → kept **in memory** by the admin app; sent as `Authorization: Bearer`.
- **Refresh token**: 256-bit random, stored as SHA-256 hash in `refresh_sessions`, sent as cookie `ap_refresh` — `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`. 14-day sliding, 30-day absolute.
- `POST /auth/refresh` rotates: old row marked `rotated_at`, new row same `family_id`. Presenting an already-rotated token → **revoke the whole family** (theft detection). Requires `Origin` match + `X-Requested-With` header (CSRF defence in depth).
- Logout revokes current session; "log out everywhere"; owner/admin can revoke any user's sessions; deactivating a user or changing role revokes all their sessions; access tokens check `sid` is not revoked (one indexed lookup) so revocation is immediate.
- Bearer header on all other endpoints ⇒ classic CSRF is not applicable to them.

### 5.8 RBAC (roles & permissions in code, not tables)
Roles are fixed and not business-editable in MVP, so `roles`/`permissions` tables would add joins without value. A `Permission` enum + `ROLE_PERMISSIONS` dict; each route declares `Depends(require(Permission.X))`. An automated test iterates **every registered admin route × every role** and asserts the expected 200/403.

| Permission | Owner | Admin | Manager | Employee |
|---|:-:|:-:|:-:|:-:|
| bookings.read (all) | ✓ | ✓ | ✓ | own only |
| bookings.write (create, reschedule, assign, cancel, notes) | ✓ | ✓ | ✓ | – |
| bookings.status (in_progress/completed) | ✓ | ✓ | ✓ | own only |
| customers.read / write | ✓ | ✓ | ✓ | name+phone of own bookings only |
| schedules.write (hours, exceptions, staff schedules) | ✓ | ✓ | ✓ | – |
| catalog.write (services, pricing, discounts, vehicle categories) | ✓ | ✓ | – | – |
| media.write (gallery, reviews) | ✓ | ✓ | ✓ | – |
| staff.write | ✓ | ✓ | – | – |
| settings.write | ✓ | ✓ | – | – |
| analytics.read (incl. revenue) | ✓ | ✓ | ✓ | – |
| users.manage (create/role/deactivate/revoke) | ✓ | admin can't touch owners or grant owner | – | – |
| audit.read, notifications.read | ✓ | ✓ | – | – |
Invariant: at least one active owner always exists.

### 5.9 Notifications
`notification_outbox` rows are inserted **in the same transaction** as the business change (booking created/confirmed/cancelled/rescheduled, contact message, user created/role changed, repeated login lockout).
Worker: every 3 s `SELECT … WHERE status='pending' AND next_attempt_at <= now() ORDER BY id LIMIT 20 FOR UPDATE SKIP LOCKED` → send via httpx to `sendMessage` (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` from env) → `sent` | retry with exponential backoff + jitter (honours Telegram `429 retry_after`) | `dead` after 8 attempts (visible in admin, manual retry). Non-retryable 4xx (bad chat id) → `dead` immediately.
Delivery is at-least-once (crash between send and commit can duplicate one message) — documented, acceptable.
**Messages contain no customer phone/name** — only reference, service, time, status and an admin link. This keeps personal data out of a foreign third-party service (see §8, §10). If the token is unset, rows stay `pending`, admin shows "Telegram not configured"; a "Send test message" button verifies the real setup.
WhatsApp: `wa.me/<digits>?text=…` links only (public site + admin "message customer" button with a prefilled confirmation text the manager sends manually). No WhatsApp Business API is claimed.

---

## 6. Database ERD

22 tables. Deliberately **not** created from the suggested list: `roles`, `permissions` (code, §5.8),
`booking_status_history` (covered by `audit_logs` with `entity_type='booking'`; one place for "who changed what"), `pricing_rules` (split into the concrete `price_entries` matrix + `discount_rules`). Added: `price_entries`, `service_options`, `employee_services`, `business_hours`, `booking_items`, `discount_rule_services`, `contact_messages`, `rate_limit_counters`.

```mermaid
erDiagram
  users ||--o{ refresh_sessions : has
  users |o--o| employees : "login for"
  users ||--o{ audit_logs : "actor of"

  service_categories ||--o{ services : groups
  services ||--o{ service_options : has
  services ||--o{ price_entries : priced
  service_options |o--o{ price_entries : priced
  vehicle_categories ||--o{ price_entries : "price per"
  discount_rules ||--o{ discount_rule_services : requires
  services ||--o{ discount_rule_services : in

  employees ||--o{ employee_services : skilled
  services ||--o{ employee_services : "performed by"
  employees ||--o{ employee_schedules : works
  employees |o--o{ schedule_exceptions : "has (null = business)"

  customers ||--o{ bookings : makes
  employees ||--o{ bookings : assigned
  vehicle_categories ||--o{ bookings : for
  discount_rules |o--o{ bookings : applied
  bookings ||--|{ booking_items : contains
  services ||--o{ booking_items : "snapshot of"

  service_categories |o--o{ gallery_images : categorises
  services |o--o{ gallery_images : illustrates

  users { uuid id PK; citext email UK; text password_hash; text role; bool is_active; int failed_logins; timestamptz locked_until }
  refresh_sessions { uuid id PK; uuid user_id FK; uuid family_id; bytea token_hash UK; timestamptz expires_at; timestamptz rotated_at; timestamptz revoked_at }
  customers { uuid id PK; text phone_e164 UK; text name; citext email; text notes }
  service_categories { int id PK; text slug UK; jsonb name_i18n; int sort_order; bool is_active }
  services { int id PK; int category_id FK; text slug UK; jsonb name_i18n; jsonb description_i18n; jsonb includes_i18n; text image_key; text price_display; bool addon_eligible; bool is_active }
  service_options { int id PK; int service_id FK; text code; text group_code; bool is_default; jsonb name_i18n }
  vehicle_categories { int id PK; text code UK; jsonb name_i18n; jsonb examples_i18n; int sort_order }
  price_entries { int id PK; int service_id FK; int option_id FK; int vehicle_category_id FK; int price_kzt; int duration_min }
  discount_rules { int id PK; text kind; smallint percent; int amount_kzt; smallint min_services; date valid_from; date valid_to; bool is_active }
  discount_rule_services { int rule_id PK; int service_id PK }
  employees { int id PK; uuid user_id FK,UK; text display_name; jsonb position_i18n; bool is_bookable; bool is_public; bool is_demo }
  employee_services { int employee_id PK; int service_id PK }
  employee_schedules { int id PK; int employee_id FK; smallint weekday; time starts_local; time ends_local }
  business_hours { smallint weekday PK; time opens; time closes }
  schedule_exceptions { int id PK; int employee_id FK; date day; bool is_closed; time opens; time closes; text reason }
  bookings { uuid id PK; text reference UK; bytea manage_token_hash UK; uuid idempotency_key UK; uuid customer_id FK; int employee_id FK; int vehicle_category_id FK; timestamptz starts_at; timestamptz ends_at; timestamptz blocked_until; text status; text source; int subtotal_kzt; int discount_kzt; int total_kzt; int final_amount_kzt; text internal_notes }
  booking_items { int id PK; uuid booking_id FK; int service_id FK; text role; jsonb name_snapshot; jsonb options_snapshot; int price_kzt; int duration_min }
  gallery_images { int id PK; text kind; int category_id FK; int service_id FK; text image_key; text before_image_key; jsonb alt_i18n; bool is_published; bool is_demo }
  reviews { int id PK; text author_name; text vehicle; smallint rating; text body; text locale; bool is_published; bool is_demo }
  business_settings { smallint id PK; jsonb data; timestamptz updated_at }
  contact_messages { uuid id PK; text name; text phone; text message; text status; timestamptz created_at }
  notification_outbox { bigint id PK; text event_type; jsonb payload; text status; int attempts; timestamptz next_attempt_at; text dedupe_key UK }
  audit_logs { bigint id PK; uuid actor_user_id FK; text actor_kind; text action; text entity_type; text entity_id; jsonb before; jsonb after; timestamptz created_at }
  rate_limit_counters { text key PK; timestamptz window_start PK; int count }
```

### Important constraints & decisions
| Table | Constraint / index | Reason |
|---|---|---|
| bookings | `EXCLUDE … (employee_id =, tstzrange(starts_at, blocked_until) &&) WHERE active` | Double booking impossible even under races or bugs |
| bookings | `CHECK (ends_at > starts_at AND blocked_until >= ends_at)`; `CHECK (total_kzt = subtotal_kzt - discount_kzt AND discount_kzt BETWEEN 0 AND subtotal_kzt)`; `CHECK (status <> 'completed' OR final_amount_kzt IS NOT NULL)`; `CHECK (status IN (...))` | Money and state integrity at DB level |
| bookings | indexes `(starts_at)`, `(status, starts_at)`, `(customer_id, starts_at DESC)`, `(employee_id, starts_at)` | Calendar, dashboard, customer history |
| bookings | `reference` = `AP-` + 6 Crockford base32 chars, unique, retry on collision | Human-friendly for phone calls; grants **no** access |
| bookings | `manage_token_hash` = SHA-256 of 256-bit token | DB leak doesn't leak working links |
| price_entries | `UNIQUE NULLS NOT DISTINCT (service_id, option_id, vehicle_category_id)`; composite FK `(option_id, service_id) → service_options(id, service_id)`; `CHECK (price_kzt >= 0 AND duration_min >= 0)`; `CHECK (option_id IS NOT NULL OR duration_min > 0)` | One price per cell; options can't be priced under the wrong service |
| booking_items | partial unique `(booking_id) WHERE role='primary'`; snapshots of name/options/price | Exactly one primary service; history survives price/service edits |
| services etc. | FKs `ON DELETE RESTRICT`; "delete" in admin = archive when referenced | Bookings history never breaks |
| *_i18n | `CHECK (col ? 'ru')` | Default locale always present |
| schedule_exceptions | `UNIQUE NULLS NOT DISTINCT (employee_id, day)`; `CHECK (is_closed OR opens < closes)` | One exception per day per scope (null = business-wide) |
| employee_schedules | `CHECK (weekday BETWEEN 1 AND 7 AND starts_local < ends_local)`; no overlapping intervals (exclusion on `int4range` of minutes) | Multiple intervals/day allowed (lunch) |
| business_settings | `CHECK (id = 1)` | Singleton |
| reviews | `CHECK (rating BETWEEN 1 AND 5)` | — |
| notification_outbox | partial index `(next_attempt_at) WHERE status='pending'`; `dedupe_key` unique | Fast polling, no duplicate enqueue |
| audit_logs | index `(entity_type, entity_id, created_at DESC)`, `(created_at DESC)`; app DB role has **no UPDATE/DELETE** grant | Append-only, booking timeline queries |
| customers | `phone_e164` unique; search by `ILIKE` on name/phone | `pg_trgm` index when > ~50k customers |
| rate_limit_counters | `UNLOGGED`, cleaned by worker | Cheap, losing it on crash is harmless |
All timestamps `timestamptz` default `now()`; `updated_at` maintained by SQLAlchemy `onupdate`.

---

## 7. API specification (v1)

Base `/api/v1`. JSON. OpenAPI at `/api/v1/openapi.json`, Swagger UI at `/api/docs` (disabled in production unless `EXPOSE_DOCS=true`).

**Conventions**
- Errors — one shape everywhere (RFC 9457 style):
  ```json
  {"type":"about:blank","title":"Slot unavailable","status":409,"code":"SLOT_UNAVAILABLE",
   "detail":"…","request_id":"…","errors":[{"field":"customer.phone","code":"invalid_phone","params":{}}]}
  ```
  Frontend maps `code` → localized message; `detail` is for logs/devs.
- Pagination `?page=1&page_size=25` (max 100) → `{items,total,page,page_size}`. Sorting `?sort=-starts_at` (allowlisted fields). Filters are explicit query params.
- Public read endpoints take `?locale=ru|kk|en` (fallback ru) and return resolved strings; admin endpoints return full `*_i18n` objects.
- All request models `extra="forbid"` (mass-assignment protection). Times in ISO 8601 with offset.

### 7.1 Public
| Method & path | Purpose | Notes |
|---|---|---|
| GET `/public/site` | Public settings subset (name, contacts, hours, socials, SEO defaults, locales, booking policy) | Cached |
| GET `/public/service-categories` | Categories | |
| GET `/public/services?category=&addon_eligible=` | Cards incl. `price_from_kzt`, `duration_range` | |
| GET `/public/services/{slug}` | Detail + price matrix + options + related | 404 if inactive |
| GET `/public/vehicle-categories` | Categories with examples | |
| POST `/public/quotes` | `{vehicle_category, service_id, option_ids[], addon_ids[]}` → lines, discount, total, duration, disclaimers | Rate-limited |
| GET `/public/availability?vehicle_category=&service_id=&option_ids=&addon_ids=&from=&to=` | Available starts grouped by local date | Range ≤ 31 days |
| POST `/public/bookings` | Create; header `Idempotency-Key`; body: selection, `starts_at`, customer `{name, phone, email?}`, `vehicle_note?`, `comment?`, `consent: true`, `locale`, honeypot | 201 `{reference, manage_token, booking summary}`; 409 `SLOT_UNAVAILABLE`; 422 |
| POST `/public/bookings/lookup` | `{token}` → summary with masked phone | Token in body, never URL |
| POST `/public/bookings/cancel` | `{token, reason?}` | 409 `CANCEL_WINDOW_PASSED` |
| GET `/public/gallery?category=&kind=` | Published images | |
| GET `/public/reviews` | Published reviews with `is_demo` | |
| GET `/public/team` | Public employees with `is_demo` | |
| POST `/public/contact` | Contact form (honeypot + signed form-render timestamp + consent) | Rate-limited |
| GET `/health`, `/health/ready` | Liveness / DB readiness | Not under `/public` |

### 7.2 Auth
POST `/auth/login` · POST `/auth/refresh` · POST `/auth/logout` · POST `/auth/logout-all` · GET `/auth/me` · POST `/auth/password` · GET `/auth/sessions` · DELETE `/auth/sessions/{id}`

### 7.3 Admin (`/admin/*`, Bearer, permission per route)
| Resource | Endpoints |
|---|---|
| Bookings | GET `/bookings?status=&from=&to=&employee_id=&q=&sort=&page=` · POST `/bookings` · GET `/bookings/{id}` · PATCH `/bookings/{id}` (notes, customer snapshot, vehicle note) · POST `/bookings/{id}/status` `{status, final_amount_kzt?, reason?}` · POST `/bookings/{id}/reschedule` `{starts_at, employee_id?}` · POST `/bookings/{id}/assign` `{employee_id}` · GET `/bookings/{id}/history` · GET `/calendar?from=&to=&employee_id=` · GET `/availability` (same engine, ignores lead time) |
| Customers | GET `/customers?q=&page=` · GET `/customers/{id}` (incl. bookings) · PATCH `/customers/{id}` |
| Catalog | CRUD `/service-categories`, `/services`, `/services/{id}/options` · PUT `/services/{id}/prices` (full matrix replace, validated) · CRUD `/vehicle-categories` · CRUD `/discount-rules` |
| Staff | CRUD `/employees` · PUT `/employees/{id}/services` · PUT `/employees/{id}/schedule` · GET `/employees/{id}/bookings` |
| Schedule | GET/PUT `/business-hours` · CRUD `/schedule-exceptions?employee_id=&from=&to=` |
| Media | POST `/media` (multipart → `{key,width,height}`) · CRUD `/gallery` · POST `/gallery/{id}/publish` · CRUD `/reviews` |
| Site | GET/PUT `/settings` · GET `/contact-messages` · PATCH `/contact-messages/{id}` |
| Users | CRUD `/users` · POST `/users/{id}/revoke-sessions` |
| Analytics | GET `/analytics/summary?from=&to=` (today, pending, confirmed, completed, recorded revenue) · GET `/analytics/trends?from=&to=&bucket=day` · GET `/analytics/activity` |
| Ops | GET `/audit-logs?entity_type=&actor=&from=&to=` · GET `/notifications?status=` · POST `/notifications/{id}/retry` · POST `/notifications/test` |

Every mutating admin call writes an `audit_logs` row (before/after with secrets and PII-heavy fields redacted) in the same transaction.

---

## 8. Security threat model

Assets: customer PII (name, phone), booking integrity, admin accounts, pricing, business reputation, availability of booking.

| # | Threat | Mitigation | Verified by |
|---|---|---|---|
| T1 | Slot hoarding / fake bookings (bots, competitors) | Per-IP and per-phone rate limits; ≤ 3 active pending bookings per phone; honeypot + min fill time; staff can mark spam/no-show; Cloudflare Turnstile as a drop-in later | API tests |
| T2 | Double booking via race | Exclusion constraint + savepoint retry; server recomputes availability | Concurrency test (N parallel requests → exactly 1 success) |
| T3 | Price tampering | Quote recomputed server-side; client prices never accepted; snapshots stored | Unit + API tests |
| T4 | Admin credential stuffing / brute force | Argon2id; per-account lockout with backoff; per-IP limit; generic errors; no user enumeration timing difference (dummy hash verify) | Tests |
| T5 | Stolen refresh token | HttpOnly/Secure/Strict cookie, path-scoped; rotation + family revocation on reuse; session list & revoke | Tests |
| T6 | Privilege escalation / IDOR | Route-level permissions + employee scoping inside queries; route×role matrix test; admin cannot modify owners | Matrix test |
| T7 | Mass assignment | Separate input schemas, `extra="forbid"`; status/price/employee never settable publicly | Tests |
| T8 | Booking manage-link guessing / leakage | 256-bit token, hashed, fragment-based URL, `Referrer-Policy: strict-origin-when-cross-origin`, page `noindex`; reference alone grants nothing; lookup masks phone | Tests |
| T9 | XSS | React escaping; no HTML from DB (plain text/paragraph rendering); JSON-LD serialized with `<` escaped; CSP (see note) | Review + test on JSON-LD |
| T10 | CSRF | Bearer tokens for API; refresh cookie SameSite=Strict + Origin check + custom header | Tests |
| T11 | Malicious upload | Max 10 MB at Caddy and app; Pillow open+verify, `MAX_IMAGE_PIXELS` cap (decompression bomb), re-encode to WebP (strips EXIF/GPS and any payload), no SVG, random UUID names, served with fixed `Content-Type` + `nosniff` | Tests |
| T12 | SQL injection | SQLAlchemy bound parameters only; sort/filter allowlists; Ruff `S` rules | Lint + tests |
| T13 | PII exposure | Public endpoints never return customer data; Telegram messages without PII; log redaction filter for phone/email/token/password/Authorization; access logs without query strings | Log test |
| T14 | Secrets leakage | pydantic-settings from env; `.env` gitignored, `.env.example` committed; app refuses to start in production with default/short secrets | Startup test |
| T15 | DoS on expensive endpoints | Availability range ≤ 31 days, page_size ≤ 100, request body limits, rate limits, DB statement timeout | Tests |
| T16 | Audit tampering | App DB role lacks UPDATE/DELETE on `audit_logs` | Migration test |
| T17 | Supply chain | Lockfiles (`uv.lock`, `package-lock.json`), `pip-audit` + `npm audit --omit=dev` in CI | CI |
| T18 | Legal: personal-data law of RK | Explicit consent checkbox on booking/contact forms with link to privacy policy; minimal data collected; hosting of DB in Kazakhstan recommended (data-localisation requirement — confirm with a lawyer); retention policy documented | Docs |

**Headers (Caddy):** HSTS (1 y), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geolocation off), CSP with `frame-ancestors 'none'`.
**CSP note:** nonce-based CSP forces dynamic rendering in Next.js and would kill ISR on public pages. Plan: `/admin` gets a strict nonce CSP (already dynamic); public pages get `script-src 'self'` + hashes where Next allows, otherwise `'unsafe-inline'` for scripts only, with everything else locked (`object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `connect-src 'self'`). Documented trade-off.

---

## 9. Phase-by-phase implementation plan

Each phase ends with: tests run (real output shown), README updated, changed-file list, **your approval before commit and before the next phase**.

| Phase | Deliverables | Exit criteria |
|---|---|---|
| **1 Foundation** | (with your OK) `git init`; repo layout; `apps/api` uv project (FastAPI app factory, settings, JSON logging, request-id, error handler, `/health`, `/health/ready`); Alembic baseline migration (extensions only); `apps/web` Next.js + TS strict + Tailwind v4 + next-intl skeleton (ru/kk/en, `as-needed` prefix) + tokens; `compose.yml` (postgres 18, api, web; the worker is added in Phase 6 when it has work to do); `.env.example`; Ruff, ESLint, Vitest, pytest configured with one real test each; GitHub Actions CI (lint, typecheck, unit tests with Postgres service, build) | `docker compose up` → web 200, api `/health/ready` 200 with DB; CI workflow passes locally via the same commands |
| **2 Public website** | Design system components; Home, Services, Service detail, Gallery, About, Contacts, Privacy, 404/error; layout, header/footer, mobile menu & sticky bar, language switcher; full DB schema for catalog/media/site + read-only public endpoints + demo seed; metadata, OG, sitemap, robots, canonical, hreflang, JSON-LD; images & credits | All pages render in 3 locales from API data; Lighthouse mobile ≥ 90 perf / 100 a11y / 100 SEO on Home & Service page (measured, reported); Kazakh glyph check; Vitest component tests |
| **3 Pricing & booking** | Pricing schema + engine + `/quotes`; scheduling schema + availability engine; booking schema with exclusion constraint; create/lookup/cancel; 7-step wizard, confirmation, manage page; .ics | Unit tests for pricing & availability (DST-free tz, multi-day jobs, exceptions, buffers, lead time); concurrency test; API integration tests; wizard Vitest tests |
| **4 Admin backend** | Users, Argon2id, JWT + refresh rotation, RBAC; admin endpoints for bookings, customers, catalog, pricing, staff, schedules, exceptions, settings, users; audit log | Route×role matrix test; auth/rotation/reuse tests; employee scoping tests |
| **5 Admin frontend** | Login/refresh flow; dashboard & trends; bookings table + filters + calendar (day by employee, week) + detail actions; services/pricing matrix editor; staff & schedule editor; customers; gallery & reviews; settings; users; audit log | Vitest for forms/tables; manual walkthrough screenshots |
| **6 Integrations** | Outbox + worker + Telegram client with retries; WhatsApp/Telegram/tel links; contact form + spam protection; media upload pipeline; admin notifications page with test message | Retry/backoff/dead-letter tests (Telegram mocked at HTTP layer); one real message sent if you provide a bot token (otherwise reported as not verified) |
| **7 Quality** | Security review against §8; a11y audit (axe in Playwright); performance pass; Playwright E2E: customer books, admin logs in, confirms, changes schedule, customer can't reach admin API, conflicting/invalid bookings rejected; bug fixes | All suites green with output shown |
| **8 Production** | Multi-stage Dockerfiles (non-root), `compose.prod.yml` + Caddy, migrations on deploy, Postgres backup script + restore doc, monitoring (health checks, JSON logs, optional Sentry if DSN given), guides (install, deploy, admin, customization), demo credentials, demo-only feature list, portfolio screenshots, smoke tests | Fresh-machine install following README works; smoke test output shown |

Not pushed to GitHub; no `git add .`/`-A`; explicit file lists per commit, each commit only with your permission.

---

## 10. Risks & trade-offs

| Risk | Impact | Mitigation / decision |
|---|---|---|
| **Kazakhstan timezone change** — since 1 Mar 2024 all KZ is UTC+5; `Asia/Almaty` was updated in tzdata 2024a. Old tzdata (old browsers, stale OS packages, Windows without `tzdata` pip package) shows UTC+6 | Bookings shown 1 h off | Pin the Python `tzdata` package; slot labels and display strings computed server-side; Node 24 ICU is current; a test asserts `Asia/Almaty` offset = +05:00 for 2026 dates |
| Single resource model (employee only, no bay/box capacity) | If the studio has fewer bays than masters, two cars could be accepted for one bay | Matches spec; adding a `bays` resource = second exclusion constraint later. **Your call (§12)** |
| Multi-day jobs (PPF, ceramic curing) | Complex end-time logic | Working-minute walk algorithm, heavily unit-tested |
| Pending bookings block slots | Abuse or forgotten requests reduce capacity | Limits per phone/IP; dashboard highlights pending; optional auto-confirm setting |
| Marketing copy in translation files | Owner can't edit hero text from admin | Fine for agency installs; move to settings later if a client needs it |
| Same Next.js app for admin | Shared deploy/blast radius | API enforces all auth; separate route tree/layout; easy to split later |
| No Redis | Postgres does rate limiting/queue | Adequate for single studio; clear upgrade trigger |
| Kazakh translations quality | Wrong/awkward Kazakh hurts trust | I produce drafts marked for native-speaker review |
| Imagery licensing / no real before-after photos | Legal risk, weaker demo | Licensed stock with credits file or your photos; fabricated pairs labelled "illustration" |
| Personal-data localisation law (RK) | Hosting abroad may be non-compliant for a real client | Recommend KZ hosting for production; Telegram messages carry no PII; lawyer review of privacy text |
| Next.js / library versions move fast | Breaking changes | Pin exact versions in Phase 1, verify current stable then |
| Windows dev path with Cyrillic & spaces | Tooling failures | Move project (§12) |
| Scope size | Long delivery | Strict phases; MVP cuts listed in §1.4 |

---

## 11. Initial acceptance criteria

**Public site**
- [ ] Every page exists in ru (no prefix), kk, en; switching language keeps the current page; no hardcoded UI strings (lint rule / test that scans components).
- [ ] Each page has unique title/description, canonical, hreflang, OG image; `sitemap.xml` lists all pages × locales; `robots.txt` excludes `/admin`, `/booking/manage`.
- [ ] JSON-LD validates (AutomotiveBusiness with address, geo, opening hours; Service + Offer in KZT); no rating markup from demo reviews.
- [ ] Demo reviews/team/gallery show a visible demo badge.
- [ ] Usable at 360 px width; keyboard-only navigation works; visible focus; `prefers-reduced-motion` honoured; Lighthouse a11y = 100 on key pages.

**Pricing**
- [ ] All amounts are integer KZT in DB and API; displayed as `45 000 ₸` (locale-aware).
- [ ] Quote total for any selection equals the backend calculation; a tampered client price has no effect.
- [ ] Changing a price in admin changes public prices/quotes (≤ 60 s) and does **not** change existing bookings.

**Booking**
- [ ] Only server-provided slots are offered; past, too-soon, beyond-horizon, closed-day and holiday slots are never offered or accepted.
- [ ] 20 concurrent requests for the same last slot → exactly one 201, the rest 409; DB holds no overlapping active bookings (constraint proven by test).
- [ ] Multi-day service end time skips non-working time correctly.
- [ ] Double submit with the same idempotency key creates one booking.
- [ ] Confirmation shows reference, Almaty-time slot, items, total, disclaimers; manage link allows cancel only inside the policy window.
- [ ] Validation errors are shown inline in the active locale.

**Admin & security**
- [ ] Unauthenticated → 401, wrong role → 403 for every admin route (matrix test); employee sees only own bookings.
- [ ] Passwords stored as Argon2id; refresh token reuse revokes the family; logout invalidates the session immediately.
- [ ] Status transitions follow §5.5; completing requires final amount; every admin mutation appears in the audit log with actor, before/after, time.
- [ ] Dashboard revenue equals the sum of `final_amount_kzt` of completed bookings in range.
- [ ] Uploads reject non-images, oversize and decompression bombs; stored files are re-encoded with random names.

**Integrations & ops**
- [ ] Booking API responds without waiting for Telegram; Telegram failure → retries with backoff → dead-letter visible in admin; no PII in messages.
- [ ] Contact form: honeypot + rate limit work; submissions visible in admin.
- [ ] `docker compose up` from a clean clone + README produces a working demo with seed data and demo credentials.
- [ ] CI runs lint, typecheck, unit/integration tests and build; Playwright E2E covers the six journeys in spec §17.

---

## 12. Decisions needed from you before Phase 1

1. **Approve this architecture** (or tell me what to change).
2. **Project location:** keep `Новая папка (2)` or move to e.g. `C:\dev\autopoint` (recommended).
3. **`git init`** in Phase 1 — OK?
4. **Bookable resource:** employee only (recommended, matches spec) or employee + bay capacity?
5. **Images:** I download free-licence stock (each download listed for your approval, credits recorded), or you supply photos?
6. **Admin UI languages:** ru + en + kk message files (default), or ru only for admin to save time?

---

## 13. Changes made during implementation

| Phase | Planned | Done instead | Why |
|---|---|---|---|
| 1 | SQLAlchemy async | Sync SQLAlchemy + psycopg 3 | psycopg async can't use Windows' default event loop; sync code is simpler to write and test; one studio's traffic is far below the threadpool limit |
| 1 | Worker stub in compose | Worker added in Phase 6 | No work for it until notifications exist |
| 2 | Next.js Cache Components + Partial Prefetching (scaffold defaults) | Disabled; classic on-demand ISR (`generateStaticParams` → `[]`, API fetch revalidated every 60 s) | Cache Components prerenders API data at build time, so images and CI builds would need a running API |
| 2 | Inter Tight (display) + Inter (text) | Inter only | Lighthouse mobile: 7 font files delayed the text LCP; one variable family (3 files) raised performance from 82–92 to 92–96 |
| 2–3 | Framer Motion (section reveals, wizard steps) | CSS animations (`.reveal`, `.step-enter`); Framer Motion not used | Zero JS. In Phase 3 the Framer `AnimatePresence` step transition kept the old step mounted until its exit animation finished — page content must never depend on an animation completing |
| 2 | `image_key` columns | `image_url` (site-relative path or URL) | No storage abstraction needed yet; uploads in Phase 6 produce `/media/…` URLs |
| 2 | Gallery categories table | Gallery items reference `service_categories` | Same categories as services; one table less |
| 2 | Lightbox | Not built | No real photos yet; revisit when photos exist |
| 2 | Contact form on Contacts page | Phase 6 (with its backend, spam protection and notifications) | Not shipping a form that doesn't send anything |
| 3 | Every booking reserves a time range | A job that fits into the employee's working day must finish that day; only longer jobs (PPF, multi-layer ceramic) continue over following working days | A 1-hour job offered at 17:30 would otherwise "finish" the next morning |
| 3 | Manage link stored as random token | Token = HMAC(`SECRET_KEY`, idempotency key); only its SHA-256 is stored | An idempotent retry can return the same link; rotating `SECRET_KEY` invalidates old links |
| 3 | Rate limiter with its own DB session per request | Short transaction on its own connection, released before the endpoint runs | Holding two pooled connections per request can deadlock the pool under load |
| 3 | Frontend calls the API via CORS | Next.js route `/api/v1/*` forwards to FastAPI (same origin, no build-time URL); in production Caddy routes `/api` directly | No CORS, no API URL baked into images |
| 3 | All translations sent to the browser (next-intl default) | Layout sends only `Error`; booking pages add `Booking`/`Common`/`Manage` | Home page HTML 207 KB → 185 KB |
| 3 | Telegram notification on new booking | Phase 6 (outbox + worker) | Not faking an integration before it exists; the audit log already records every booking |
| 4 | Gallery and reviews admin in Phase 4 | Phase 6, together with image uploads | Managing a gallery without uploads would be half a feature |
| 4 | Analytics endpoints with the admin API | Phase 5, built with the dashboard that uses them | Designed against real UI needs, not guessed now |
| 4 | Audit log append-only via DB grants | Phase 8 (needs a separate DB role in the production setup) | The app writes audit rows in the same transaction as each change; no endpoint edits or deletes them |
| 4 | Admin API on the same Next.js `/api` proxy | Proxy now forwards `Authorization`, `X-Requested-With`, cookies and `Set-Cookie` | The admin app can log in through the website origin; verified end-to-end on Docker |
| 4 | Refresh in two tabs at once | Treated as token reuse: that login ends and the user logs in again | Simplest correct rotation; the Phase 5 admin app will refresh from one place only |
| 5 | Admin UI in ru + kk + en | Russian only for now; texts in `messages/ru.json` → `Admin` (excluded from the parity test) | Staff work in Russian; translating ~400 admin strings can follow without code changes |
| 5 | TanStack Query + TanStack Table | TanStack Query only; plain HTML tables with server-side filters/pagination | Tables are simple; no client-side sorting/grouping needed |
| 5 | Access token refresh from any tab | Web Locks API serializes refreshes across tabs | Rotated refresh tokens are never sent twice (Phase 4 two-tab issue) |
| 5 | Week calendar view | Day view (columns per master) + table with date filters | Covers dispatch; a week grid adds little for 2–5 masters |
| 5 | Demo credentials in Phase 8 | Dev-only demo accounts in the seed now, refused in production (tested) | The admin can't be demonstrated without them |
| 6 | httpx for the Telegram client | Standard-library `urllib` | One POST per message; no extra dependency |
| 6 | Cloudflare Turnstile as a later option for spam | Honeypot + signed timing token + per-IP rate limit, no CAPTCHA | No third-party script or tracking; add Turnstile if real spam gets through |
| 6 | Deleting gallery items removes files | Files stay on disk (`shortcut:` comment in code) | Never breaks a cached page; add an orphan sweep if storage grows |
| 6 | Real Telegram delivery verified | **Not verified with a real bot**: no token was provided. The HTTP layer is tested with a mocked Telegram API (success, 429 retry_after, 4xx, 5xx, network errors) | Set the two env vars and use «Отправить тестовое» to verify |
| 6 | Optional translated fields | `I18nInputs` makes Russian required only for required texts | A required-everywhere version silently blocked saving optional captions/bios (found in browser testing) |
| 7 | Strict nonce CSP for `/admin` | One CSP for the whole site with `script-src 'self' 'unsafe-inline'`; everything else locked (`frame-ancestors 'none'`, `object-src 'none'`, `connect-src 'self'`, `form-action 'self'`) | A nonce forces dynamic rendering and the admin shares the layout pipeline; React escaping is the XSS defence, no HTML from the DB |
| 7 | Security headers in Caddy (Phase 8) | Set by Next.js (`next.config.ts`) for every page and proxied API response | Works on any host (Render has no Caddy); Caddy may add more later |
| 7 | Lighthouse scores in CI | Playwright performance budgets (compressed JS ≤ 260 KB, page ≤ 500 KB, LCP, CLS) | Deterministic byte budgets catch regressions; measured: JS 172–215 KB, page 375–412 KB, CLS 0 |
| 7 | `npm audit` must be clean | CI fails on critical only. Known high: `picomatch` ReDoS through `next-intl` → `@parcel/watcher` (dev-time file watching with config globs, no fixed version exists) | Not reachable with user input; recheck when a fix ships |
| 7 | Per-IP rate limits in the compose stack | Every request reaches the API from the web container, so per-IP limits are shared in the dev stack | Phase 8: Caddy sends `/api` straight to FastAPI with the real client address; on Render, uvicorn reads `X-Forwarded-For` from the trusted local proxy |
| 7 | — | Request body limits (1 MB JSON, ~10 MB upload) in the API and the proxy; chunked bodies refused; 10 s statement timeout; `hide_parameters` so SQL errors never log customer data | Gaps found in the §8 review (T13, T15) |
