#!/bin/sh
# Replaces the database with a backup. Everything since that backup is lost.
#   docker compose stop api web
#   docker compose exec backup sh /scripts/restore.sh /backups/biotrakr_2026-10-09_020000.dump
#   docker compose start api web
set -eu
file="${1:?Give the backup file, e.g. /backups/biotrakr_2026-10-09_020000.dump}"
[ -f "$file" ] || { echo "No such file: $file"; exit 1; }
pg_restore --list "$file" > /dev/null
db="$PGDATABASE"
echo "Restoring $file into '$db' (the current data will be replaced)..."
psql -v ON_ERROR_STOP=1 -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$db' AND pid <> pg_backend_pid();" > /dev/null
psql -v ON_ERROR_STOP=1 -d postgres -c "DROP DATABASE IF EXISTS \"$db\";" -c "CREATE DATABASE \"$db\";"
# TimescaleDB needs its restore mode around pg_restore.
psql -v ON_ERROR_STOP=1 -d "$db" -c "CREATE EXTENSION IF NOT EXISTS timescaledb;" -c "SELECT timescaledb_pre_restore();" > /dev/null
pg_restore --no-owner --exit-on-error -d "$db" "$file" || {
  psql -d "$db" -c "SELECT timescaledb_post_restore();" > /dev/null
  echo "RESTORE FAILED"; exit 1;
}
psql -v ON_ERROR_STOP=1 -d "$db" -c "SELECT timescaledb_post_restore();" > /dev/null
echo "Restored. Start the app again: docker compose start api web"
