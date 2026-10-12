#!/bin/sh
# Quick health report. On the server, in the deploy/ folder:  sh scripts/status.sh
cd "$(dirname "$0")/.."

# Read a setting from .env the way Compose does (comments and quotes removed).
setting() {
  sed -n "s/^$1=//p" .env 2>/dev/null | tail -1 | sed 's/[[:space:]]*#.*$//; s/^["'\'']//; s/["'\'']$//; s/[[:space:]]*$//'
}

docker compose ps --format 'table {{.Service}}\t{{.Status}}'
echo

host=$(setting BIOTRAKR_HOST)
printf 'API readiness: '
# Asks the server itself, so it works even if this machine cannot resolve the name.
curl -sk --max-time 5 --resolve "${host:-localhost}:443:127.0.0.1" "https://${host:-localhost}/api/health/ready" || printf 'NOT RESPONDING'
echo

dir=$(setting BACKUP_DIR); dir=${dir:-./backups}
latest=$(ls -1t "$dir"/biotrakr_*.dump 2>/dev/null | head -1)
if [ -z "$latest" ]; then
  echo "Latest backup: NONE YET"
else
  age_h=$(( ($(date +%s) - $(stat -c %Y "$latest")) / 3600 ))
  if [ "$age_h" -ge 26 ]; then
    echo "Latest backup: $latest ($age_h hours old) -- WARNING: backups have stopped"
  else
    echo "Latest backup: $latest ($age_h hours old)"
  fi
fi

# What the backup container last recorded (the file the app reads too).
# scripts/status-file.sh writes one value per line: top-level values are
# indented two spaces, the second copy's four, so plain sed can pick them out.
status=$(docker compose exec -T backup cat /status/backup.json 2>/dev/null | tr -d '\r')
value() {
  printf '%s\n' "$status" | sed -n "s/^$1\"$2\": \(.*\)$/\1/p" | head -1 \
    | sed 's/,$//; s/^"\(.*\)"$/\1/; s/\\"/"/g; s/\\\\/\\/g; s/^null$//'
}
# "N hours ago" for a recorded time, or nothing if this date cannot read it.
ago() {
  t=$(date -d "$1" +%s 2>/dev/null) || return 0
  echo " ($(( ($(date +%s) - t) / 3600 )) hours ago)"
}
gb() { [ -n "$1" ] && echo "$(( $1 / 1073741824 )) GB"; }
free_of() {
  printf '%s\n' "$status" | sed -n "s/^$1\"disk\": { \"freeBytes\": \([0-9]*\), \"totalBytes\": \([0-9]*\) }.*/\1 \2/p" | head -1
}

if [ -z "$status" ]; then
  echo "Backup status: NOT AVAILABLE (is the backup container running?)"
  exit 0
fi

error=$(value '  ' lastError)
[ -z "$error" ] || echo "Last backup FAILED: $error"
set -- $(free_of '  ')
[ -z "${1:-}" ] || echo "Backup disk: $(gb "$1") free of $(gb "$2")"

copy_dir=$(setting BACKUP_COPY_DIR)
if [ "$(value '    ' configured)" != true ]; then
  echo "Second copy: NOT SET UP -- backups are only on this server (set BACKUP_COPY_DIR, see the guide)"
else
  copied=$(value '    ' lastSuccessAt)
  copy_error=$(value '    ' lastError)
  if ! docker compose exec -T backup timeout -s KILL 20 test -f /backup-copy/.biotrakr-backup-target 2>/dev/null; then
    echo "Second copy: $copy_dir is NOT MOUNTED (no .biotrakr-backup-target file) -- copies will fail"
  fi
  if [ -n "$copy_error" ]; then
    echo "Second copy: LAST COPY FAILED: $copy_error"
    [ -z "$copied" ] || echo "Second copy: last good copy $copied$(ago "$copied")"
  elif [ -n "$copied" ]; then
    echo "Second copy: $copy_dir, last copied $copied$(ago "$copied")"
  else
    echo "Second copy: $copy_dir, no copy made yet (after the next backup)"
  fi
  set -- $(free_of '    ')
  [ -z "${1:-}" ] || echo "Second copy disk: $(gb "$1") free of $(gb "$2")"
fi
