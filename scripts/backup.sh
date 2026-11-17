#!/bin/sh
# Backs up the production database and uploaded images (compose.prod.yml).
#   scripts/backup.sh [directory]      default: backups/
# Keeps the newest $KEEP (default 14) of each. Daily cron example (02:30):
#   30 2 * * * cd /srv/autopoint && scripts/backup.sh >> backups/backup.log 2>&1
# Copy the directory off the server too (another disk, S3, …): a backup on the same disk
# does not survive losing the server.
set -eu
DIR=${1:-backups}
KEEP=${KEEP:-14}
COMPOSE="docker compose -f compose.prod.yml --env-file ${ENV_FILE:-.env.prod}"
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$DIR"

# Custom format: compressed, and pg_restore can restore it into an empty or existing database.
$COMPOSE exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$DIR/db-$STAMP.dump.part"
mv "$DIR/db-$STAMP.dump.part" "$DIR/db-$STAMP.dump"
# Commands go through `sh -c '…'` so Git Bash on Windows does not rewrite the /data path.
$COMPOSE exec -T api sh -c 'tar -C /data -czf - media' > "$DIR/media-$STAMP.tar.gz.part"
mv "$DIR/media-$STAMP.tar.gz.part" "$DIR/media-$STAMP.tar.gz"

for pattern in "db-*.dump" "media-*.tar.gz"; do
  # shellcheck disable=SC2012 # names are our own timestamps, no spaces
  ls -1t "$DIR"/$pattern 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do rm -f -- "$old"; done
done
echo "Backup written: $DIR/db-$STAMP.dump, $DIR/media-$STAMP.tar.gz"
