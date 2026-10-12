#!/bin/sh
# Backs up every night at BACKUP_HOUR, in the time zone set by TZ (.env).
# Records when it started and when the next backup is due in
# /status/backup.json, so the app can tell when backups are overdue.
set -u
here=$(dirname "$0")
. "$here/status-file.sh"
# "08" would be read as octal: strip leading zeros, and insist on 0-23.
hour=$(echo "${BACKUP_HOUR:-2}" | sed 's/^0*//')
hour=${hour:-0}
case "$hour" in
  [0-9]|1[0-9]|2[0-3]) ;;
  *) echo "BACKUP_HOUR must be 0-23 (got '${BACKUP_HOUR:-}'); using 2"; hour=2 ;;
esac
echo "Nightly backups at ${hour}:00 (${TZ:-UTC}), kept ${keep_days} days, in /backups"
if [ -z "${BACKUP_COPY_CONFIGURED:-}" ]; then
  echo "No second copy: BACKUP_COPY_DIR is not set, so the backups are only on this server"
elif copy_marked; then
  echo "A second copy of each backup goes to BACKUP_COPY_DIR"
else
  echo "WARNING: BACKUP_COPY_DIR is not mounted (no $copy_marker file there): copies will fail."
  echo "If it is mounted on the server now, run: docker compose restart backup"
fi

# Seconds until the next BACKUP_HOUR:00 that is more than $1 seconds away.
seconds_to_next_run() {
  # Seconds since midnight, without date arithmetic (busybox-safe).
  h=$(date +%H | sed 's/^0//'); m=$(date +%M | sed 's/^0//'); s=$(date +%S | sed 's/^0//')
  since_midnight=$(( ${h:-0} * 3600 + ${m:-0} * 60 + ${s:-0} ))
  wait=$(( hour * 3600 - since_midnight ))
  if [ "$wait" -le "$1" ]; then wait=$(( wait + 86400 )); fi
  echo "$wait"
}

# Records when the next backup is due, $1 seconds from now.
record_next_run() {
  status_set nextRunAt "$(date -u -d "@$(( $(date +%s) + $1 ))" +%Y-%m-%dT%H:%M:%SZ)"
  status_write
}

status_set loopStartedAt "$(status_now)"
wait=$(seconds_to_next_run 0)
record_next_run "$wait"
while true; do
  sleep "$wait"
  sh "$here/backup.sh" || echo "$(date -Iseconds) BACKUP FAILED"
  # At least a minute ahead: a clock that woke us a little early must not
  # run the same night's backup twice.
  wait=$(seconds_to_next_run 60)
  record_next_run "$wait"
done
