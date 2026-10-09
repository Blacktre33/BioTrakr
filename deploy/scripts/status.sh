#!/bin/sh
# Quick health report, run on the server from the deploy/ folder:  sh scripts/status.sh
cd "$(dirname "$0")/.."
docker compose ps --format 'table {{.Service}}\t{{.Status}}'
echo
host=$(grep '^BIOTRAKR_HOST=' .env | cut -d= -f2)
printf 'API readiness: '
curl -sk --max-time 5 "https://${host:-localhost}/api/health/ready" || echo "NOT RESPONDING"
echo
printf 'Latest backup: '
ls -1t backups/biotrakr_*.dump 2>/dev/null | head -1 || echo "none yet"
