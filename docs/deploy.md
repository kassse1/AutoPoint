# Deploying AutoPoint

Two ways to run it:

| | Production server (`compose.prod.yml`) | Free preview (`render.yaml`) |
|---|---|---|
| For | a real studio | showing the project |
| HTTPS | Caddy + Let's Encrypt | Render |
| Uploaded images | kept (Docker volume) | lost on every restart |
| Database | yours, with backups | free, expires after 30 days |
| Audit log | append-only (restricted DB role) | one DB role |

The Render preview is described in the [README](../README.md#deploy-to-render-free-preview).
This guide covers the production server.

## 1. Server

- A Linux VPS with Docker Engine and the Compose plugin; 2 GB RAM is enough. For customer
  data of a studio in Kazakhstan, prefer hosting in Kazakhstan (personal-data localisation
  law; confirm with a lawyer).
- A domain with an `A` (and `AAAA` if you have IPv6) record pointing at the server.
- Firewall: open only 22 (SSH), 80 and 443. Nothing else is published by the stack.

## 2. Install

```bash
git clone https://github.com/<you>/AutoPoint.git /srv/autopoint && cd /srv/autopoint
cp .env.prod.example .env.prod
```

Fill in `.env.prod`:

- `DOMAIN`: the site's domain.
- `POSTGRES_PASSWORD`, `APP_DB_PASSWORD` and `SECRET_KEY`: each from `openssl rand -base64 32`.
- `SEED_DEMO`: `true` only for a demo with the example catalogue.

Start it:

```bash
docker compose -f compose.prod.yml --env-file .env.prod up -d --build --wait
```

On start:

1. **Postgres** creates the restricted role `autopoint_app` (first start only).
2. **The API**, as the database owner:
   - applies the migrations;
   - grants `autopoint_app` access to all tables, except changing or deleting audit log rows;
   - loads the demo seed if `SEED_DEMO=true`.
3. **The API serves requests** as `autopoint_app`.
4. **Caddy** gets the HTTPS certificate.

Create the first owner (the password is asked interactively):

```bash
docker compose -f compose.prod.yml --env-file .env.prod exec api python -m app.manage create-user --email you@studio.kz --name "Имя" --role owner
```

Check the deployment:

```bash
scripts/smoke.sh https://your-domain.kz
```

It is read-only and checks:

- the main pages in three languages;
- that the API and the database are ready;
- that the admin API needs a login;
- the security headers;
- the HTTP → HTTPS redirect.

Then sign in at `/admin`, fill in **Настройки сайта** (contacts, address, map coordinates,
logo), the catalogue and prices, staff and their schedules. See [admin-guide.md](admin-guide.md).

## 3. Updates

```bash
git pull
docker compose -f compose.prod.yml --env-file .env.prod up -d --build --wait
scripts/smoke.sh https://your-domain.kz
```

Migrations run automatically when the API starts. Make a backup before updating.

## 4. Backups

```bash
scripts/backup.sh            # → backups/db-<time>.dump and backups/media-<time>.tar.gz
```

- **Contents:** the database (`pg_dump`, custom format) and the uploaded images.
- **Retention:** keeps the newest 14 of each (`KEEP=30 scripts/backup.sh` keeps more).
- **Schedule:** run it daily from cron.
- **Off-server copy:** copy `backups/` elsewhere (another server, object storage). A backup
  on the same disk does not survive losing the server.

```
30 2 * * * cd /srv/autopoint && scripts/backup.sh >> backups/backup.log 2>&1
```

**Restore** replaces the current data. The site is down for the minute it takes:

```bash
scripts/restore.sh backups/db-20261118-023000.dump backups/media-20261118-023000.tar.gz
```

Test a restore now and then, ideally on a second machine: an untested backup is a guess.

## 5. Monitoring

- **Health:**
  - `https://your-domain.kz/health/ready` returns 200 when the API reaches the database;
    point an uptime monitor (UptimeRobot, Better Stack…) at it;
  - `scripts/smoke.sh` can also run from cron on another machine.
- **Containers:** each one has a health check and `restart: unless-stopped`.
- **Logs:** JSON lines on stdout, read with
  `docker compose -f compose.prod.yml --env-file .env.prod logs -f api`.
  - Every API response carries an `X-Request-ID`, which also appears in the log line.
  - Logs never contain request bodies, query strings or SQL parameters.
- **Notifications:** Admin → Уведомления shows queued and failed Telegram messages.

## 6. Security notes

- **Secrets** live only in `.env.prod` (git-ignored). Changing `SECRET_KEY` signs everyone
  out and invalidates the booking links already sent to customers.
- **Network:** the API and the database are not reachable from outside. Caddy is the only
  published service and sends the real client address to the API, which uses it for rate
  limits.
- **HTTP layer:** request bodies are capped at 11 MB in Caddy, and again in the API
  (1 MB for JSON).
- **Threat model:** the full list is in [PHASE-0-architecture.md §8](PHASE-0-architecture.md).
