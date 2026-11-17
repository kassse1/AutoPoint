# AutoPoint

Website, booking system and admin panel for a premium car detailing studio in Astana
(demo brand). Built so it can be re-branded for other automotive businesses through
configuration.

> **Status: Phase 1 — Foundation.** Only infrastructure exists: API skeleton with health
> checks, database migrations, a localized placeholder page and CI. No business features yet.
> Architecture and roadmap: [docs/PHASE-0-architecture.md](docs/PHASE-0-architecture.md).

## Stack

| Part | Tech |
|---|---|
| Web (`apps/web`) | Next.js 16 (App Router, Cache Components), React 19, TypeScript strict, Tailwind CSS 4, next-intl (ru / kk / en) |
| API (`apps/api`) | Python 3.13, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, psycopg 3 |
| Database | PostgreSQL 18 |
| Tooling | uv, npm, Ruff, pytest, ESLint, Vitest, Docker Compose, GitHub Actions |

## Repository layout

```
apps/api      FastAPI app (app/), migrations (migrations/), tests (tests/)
apps/web      Next.js app (src/app/[locale]/…), translations (messages/)
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
- API health: http://localhost:8000/health and http://localhost:8000/health/ready
- API docs (non-production only): http://localhost:8000/api/docs

The API container applies migrations on start. Copy `.env.example` to `.env` to change
database credentials or ports.

## Local development (without containers for api/web)

Prerequisites: Python 3.13 + [uv](https://docs.astral.sh/uv/), Node.js 24, Docker (for Postgres).

```bash
docker compose up -d db
```

API (from `apps/api`):

```bash
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

Web (from `apps/web`):

```bash
npm install
npm run dev
```

## Checks

API (from `apps/api`, needs the `db` container running — tests use a real PostgreSQL):

```bash
uv run ruff check . && uv run ruff format --check . && uv run pytest
```

Web (from `apps/web`):

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

CI (`.github/workflows/ci.yml`) runs the same commands plus `docker compose build`.

## Configuration

API settings come from environment variables only (`apps/api/app/config.py`):

| Variable | Default | Notes |
|---|---|---|
| `ENVIRONMENT` | `development` | `production` hides OpenAPI docs |
| `DATABASE_URL` | local compose db | `postgresql+psycopg://…` |
| `CORS_ORIGINS` | `[]` | JSON list; empty in production (same origin behind the proxy) |
| `LOG_LEVEL` | `INFO` | logs are JSON lines with `request_id` |

## API conventions (so far)

- Every error is `application/problem+json`: `{type, title, status, code, detail, request_id, errors[]}`.
- Every response carries `X-Request-ID` (a safe incoming value is reused, otherwise generated).
- Access logs record method, path (never the query string), status and duration.

## Notes

- Kazakh (`kk`) texts are drafts and need review by a native speaker.
- The business timezone is `Asia/Almaty` (UTC+5 since 2024); the API pins the `tzdata` package.
