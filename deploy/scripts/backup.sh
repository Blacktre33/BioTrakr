#!/bin/sh
# One backup now: a compressed pg_dump in /backups, then old ones pruned.
# Run by backup-loop.sh every night, or by hand:
#   docker compose exec backup sh /scripts/backup.sh
set -eu
# Backups hold staff details and password hashes: readable by root only.
umask 077
dir="${BACKUP_TARGET:-/backups}"
mkdir -p "$dir"
stamp=$(date +%Y-%m-%d_%H%M%S)
file="${dir}/biotrakr_${stamp}.dump"
tmp="${file}.partial"
trap 'rm -f "$tmp"' EXIT

pg_dump --format=custom --compress=6 --file="$tmp" "$PGDATABASE"
# A dump that cannot be listed is not a backup (this checks it is complete
# and readable; only a test restore proves the data, see the guide).
pg_restore --list "$tmp" > /dev/null
mv "$tmp" "$file"
echo "$(date -Iseconds) backup written: $file ($(du -h "$file" | cut -f1))"

# The HTTPS certificate authority (if BioTrakr made its own): losing it
# means installing a new root certificate on every phone and PC.
if [ -d /caddy/caddy/pki ]; then
  tar czf "${dir}/caddy-pki.tgz.partial" -C /caddy/caddy pki && mv "${dir}/caddy-pki.tgz.partial" "${dir}/caddy-pki.tgz"
fi

find "$dir" -name 'biotrakr_*.dump' -mtime +"${BACKUP_KEEP_DAYS:-14}" -print -delete
find "$dir" -name '*.partial' -mmin +60 -print -delete

if [ -n "${BACKUP_PING_URL:-}" ]; then
  # Optional: tell a monitor (e.g. Uptime Kuma, healthchecks.io) it worked.
  wget -q -O /dev/null "$BACKUP_PING_URL" || echo "could not reach BACKUP_PING_URL"
fi
