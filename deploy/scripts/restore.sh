#!/bin/sh
# Replaces the database with a backup. Everything entered since that backup
# is lost (the current database is kept aside, see the end).
#
#   docker compose stop api web
#   docker compose exec backup sh /scripts/restore.sh /backups/biotrakr_2026-10-09_020000.dump
#   docker compose start api web
#
# Safe order: the backup is restored into a separate database first. Only
# when that succeeds is the current database renamed aside and the restored
# one put in its place, so a failed restore leaves the current data as it was.
set -eu
file="${1:?Give the backup file, e.g. /backups/biotrakr_2026-10-09_020000.dump}"
[ -f "$file" ] || { echo "No such file: $file"; exit 1; }
pg_restore --list "$file" > /dev/null || { echo "This file is not a readable backup: $file"; exit 1; }

db="$PGDATABASE"
staging="${db}_restore"
stamp=$(date +%Y%m%d_%H%M%S)
aside="${db}_before_restore_${stamp}"
q() { psql -v ON_ERROR_STOP=1 -X -q -At -d postgres -c "$1"; }

# The application must not be writing while the database is swapped.
busy=$(q "SELECT count(*) FROM pg_stat_activity WHERE datname = '$db' AND backend_type = 'client backend' AND pid <> pg_backend_pid();")
if [ "$busy" != "0" ]; then
  echo "The application is still connected ($busy connections). Stop it first:"
  echo "  docker compose stop api web"
  exit 1
fi

echo "Restoring $file into a staging database..."
q "DROP DATABASE IF EXISTS \"$staging\" WITH (FORCE);"
q "CREATE DATABASE \"$staging\";"
psql -v ON_ERROR_STOP=1 -X -q -d "$staging" -c "CREATE EXTENSION IF NOT EXISTS timescaledb;" -c "SELECT timescaledb_pre_restore();" > /dev/null
if ! pg_restore --no-owner --exit-on-error -d "$staging" "$file"; then
  q "DROP DATABASE IF EXISTS \"$staging\" WITH (FORCE);"
  echo "RESTORE FAILED. The current database was not touched."
  exit 1
fi
psql -v ON_ERROR_STOP=1 -X -q -d "$staging" -c "SELECT timescaledb_post_restore();" > /dev/null

echo "Swapping it in (the current data is kept as \"$aside\")..."
# TimescaleDB background workers hold connections and may reconnect at any
# moment, so close them and rename in one go, retrying a few times.
swapped=""
for attempt in 1 2 3 4 5; do
  if psql -v ON_ERROR_STOP=1 -X -q -d postgres \
      -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('$db', '$staging') AND pid <> pg_backend_pid();" \
      -c "ALTER DATABASE \"$db\" RENAME TO \"$aside\";" > /dev/null 2>&1; then
    swapped=1; break
  fi
  sleep 1
done
[ -n "$swapped" ] || { echo "Could not take the current database offline; nothing was changed. Try again."; q "DROP DATABASE IF EXISTS \"$staging\" WITH (FORCE);"; exit 1; }
for attempt in 1 2 3 4 5; do
  if psql -v ON_ERROR_STOP=1 -X -q -d postgres \
      -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$staging' AND pid <> pg_backend_pid();" \
      -c "ALTER DATABASE \"$staging\" RENAME TO \"$db\";" > /dev/null 2>&1; then
    swapped=2; break
  fi
  sleep 1
done
if [ "$swapped" != 2 ]; then
  # Put the original back rather than leave no database under the live name.
  q "ALTER DATABASE \"$aside\" RENAME TO \"$db\";"
  echo "Could not put the restored database in place; the original is back. Try again."
  exit 1
fi

echo
echo "Restored. Start the app again:  docker compose start api web"
echo "The previous data is still in database \"$aside\". Once everything looks"
echo "right, free its space with:"
echo "  docker compose exec db psql -U $PGUSER -d postgres -c 'DROP DATABASE \"$aside\";'"
