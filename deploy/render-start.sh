#!/bin/bash
# Start script of deploy/render.Dockerfile: prepare the database, then run the three processes.
# If any of them exits, the container exits and Render restarts it.
set -euo pipefail

# Render sets RENDER_EXTERNAL_URL (https://<name>.onrender.com); use it unless set explicitly.
export SITE_URL="${SITE_URL:-${RENDER_EXTERNAL_URL:-http://localhost:${PORT}}}"
export PUBLIC_URL="${PUBLIC_URL:-$SITE_URL}"

cd /app
alembic upgrade head
python -m app.seed  # demo content on an empty database; no demo logins in production
if [ -n "${OWNER_EMAIL:-}" ]; then
  # Exits non-zero when the user already exists; that is fine on every later start.
  python -m app.manage create-user --email "$OWNER_EMAIL" --name "Владелец" --role owner || true
fi

uvicorn app.main:app --host 127.0.0.1 --port 8000 &
python -m app.worker &
# Render overrides HOSTNAME with the instance name, which Next.js cannot bind to.
HOSTNAME=0.0.0.0 node /web/server.js &
status=0
wait -n || status=$?
echo "A process exited (status $status); stopping the container" >&2
exit "$status"
