#!/bin/sh
# Postgres init script (runs once on an empty data volume, see compose.prod.yml).
# The application connects as autopoint_app; tables are owned by $POSTGRES_USER, which runs
# the migrations. Table grants are applied on every deploy by `python -m app.manage grant-app-role`.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_password="$APP_DB_PASSWORD" <<'SQL'
CREATE ROLE autopoint_app LOGIN PASSWORD :'app_password';
SQL
