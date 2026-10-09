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
