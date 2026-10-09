#!/bin/sh
# Backs up every night at BACKUP_HOUR, in the time zone set by TZ (.env).
set -u
# "08" would be read as octal: strip leading zeros, and insist on 0-23.
hour=$(echo "${BACKUP_HOUR:-2}" | sed 's/^0*//')
hour=${hour:-0}
case "$hour" in
  [0-9]|1[0-9]|2[0-3]) ;;
  *) echo "BACKUP_HOUR must be 0-23 (got '${BACKUP_HOUR:-}'); using 2"; hour=2 ;;
esac
echo "Nightly backups at ${hour}:00 (${TZ:-UTC}), kept ${BACKUP_KEEP_DAYS:-14} days, in /backups"
while true; do
  # Seconds since midnight, without date arithmetic (busybox-safe).
  h=$(date +%H | sed 's/^0//'); m=$(date +%M | sed 's/^0//'); s=$(date +%S | sed 's/^0//')
  since_midnight=$(( ${h:-0} * 3600 + ${m:-0} * 60 + ${s:-0} ))
  wait=$(( hour * 3600 - since_midnight ))
  [ "$wait" -le 0 ] && wait=$(( wait + 86400 ))
  sleep "$wait"
  sh /scripts/backup.sh || echo "$(date -Iseconds) BACKUP FAILED"
  sleep 60
done
