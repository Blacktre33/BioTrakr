#!/bin/sh
# One backup now: a compressed pg_dump in /backups, then old ones pruned.
# Run by backup-loop.sh every night, or by hand:
#   docker compose exec backup sh /scripts/backup.sh
set -eu
dir="${BACKUP_TARGET:-/backups}"
mkdir -p "$dir"
stamp=$(date +%Y-%m-%d_%H%M%S)
file="${dir}/biotrakr_${stamp}.dump"
tmp="${file}.partial"
pg_dump --format=custom --compress=6 --file="$tmp" "$PGDATABASE"
# Only a complete, readable dump counts as a backup.
pg_restore --list "$tmp" > /dev/null
mv "$tmp" "$file"
echo "$(date -Iseconds) backup written: $file ($(du -h "$file" | cut -f1))"
find "$dir" -name 'biotrakr_*.dump' -mtime +"${BACKUP_KEEP_DAYS:-14}" -print -delete
if [ -n "${BACKUP_PING_URL:-}" ]; then
  # Optional: tell a monitor (e.g. healthchecks.io, Uptime Kuma) it worked.
  wget -q -O /dev/null "$BACKUP_PING_URL" || echo "could not reach BACKUP_PING_URL"
fi
