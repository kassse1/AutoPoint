#!/bin/sh
# Restores a backup made by scripts/backup.sh. REPLACES the current data.
#   scripts/restore.sh backups/db-20261118-023000.dump [backups/media-20261118-023000.tar.gz]
# The site is down while it runs (api, worker and web are stopped, then started again).
set -eu
DB_DUMP=${1:?usage: scripts/restore.sh <db-*.dump> [media-*.tar.gz]}
MEDIA=${2:-}
COMPOSE="docker compose -f compose.prod.yml --env-file ${ENV_FILE:-.env.prod}"

printf 'This replaces the database%s with the backup. Type "restore" to continue: ' "${MEDIA:+ and uploaded images}"
read -r answer
[ "$answer" = restore ] || { echo "Cancelled."; exit 1; }

$COMPOSE stop web worker api
# --clean drops each object before recreating it; ownership and grants come from the dump.
$COMPOSE exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --role="$POSTGRES_USER" --single-transaction' < "$DB_DUMP"
if [ -n "$MEDIA" ]; then
  $COMPOSE run --rm --no-deps -T --entrypoint sh api -c 'rm -rf /data/media/* && tar -C /data -xzf -' < "$MEDIA"
fi
# The api re-applies the app role grants on start.
$COMPOSE up -d --wait
echo "Restored from $DB_DUMP${MEDIA:+ and $MEDIA}."
