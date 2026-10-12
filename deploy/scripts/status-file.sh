# Shared by backup.sh and backup-loop.sh (not run on its own).
#
# Keeps /status/backup.json up to date. The app reads it (read-only) to warn
# administrators when a backup or its second copy fails or is overdue, so its
# layout is a contract: change it only together with the API.
#
# There is no jq here, so each value lives in its own small file under
# /status/state/ (no file = null). A run changes only the values it knows
# about and keeps the rest (a failed run keeps the last success, say), and
# the JSON is written out in full from those files every time.

status_dir="${BACKUP_STATUS_DIR:-/status}"
state_dir="$status_dir/state"
# BACKUP_COPY_DIR on the server, as seen in here (see docker-compose.yml).
copy_dir="${BACKUP_COPY_TARGET:-/backup-copy}"
# Hospital IT creates this file once on the share. A share that failed to
# mount leaves an empty folder on this server's own disk, without it.
copy_marker=.biotrakr-backup-target

# The copy location is usually a network share. If the NAS stops answering,
# a file operation there can wait for ever (an NFS "hard" mount) and hold up
# the local backups as well, so everything done there has a time limit.
limit() { secs=$1; shift; timeout -s KILL "$secs" "$@"; }
copy_marked() { limit 30 test -f "$copy_dir/$copy_marker" 2>/dev/null; }

# Days to keep backups: a whole number, or the default.
keep_days="${BACKUP_KEEP_DAYS:-14}"
case "$keep_days" in
  ''|*[!0-9]*) echo "BACKUP_KEEP_DAYS must be a whole number of days (got '$keep_days'); using 14" >&2; keep_days=14 ;;
esac
keep_days=$(echo "$keep_days" | sed 's/^0*\([0-9]\)/\1/')

status_now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# Saves one value (an empty one means null). Never stops the backup: at
# worst the app sees an old status and warns about that.
status_set() {
  (
    umask 022   # the app reads these as a different user
    mkdir -p "$state_dir" || exit 1
    if [ -n "$2" ]; then
      printf '%s\n' "$2" > "$state_dir/.$1.$$" && mv -f "$state_dir/.$1.$$" "$state_dir/$1"
    else
      rm -f "$state_dir/$1"
    fi
  ) || echo "warning: could not save $1 in $state_dir" >&2
  return 0
}

# Saves error text as one line of plain ASCII, at most 300 characters.
status_set_error() {
  text=$(printf '%s' "$2" | tr '\t\r\n' '   ' | tr -d '\000-\037\177' | tr '\200-\377' '?' \
    | sed 's/   */ /g; s/^ //; s/ $//' | cut -c1-300)
  status_set "$1" "${text:-unknown error}"
}

status_get() { head -n 1 "$state_dir/$1" 2>/dev/null || true; }

# A saved value as a JSON string (or null). \ and " are escaped; control
# characters were already removed when it was saved, and again here.
json_text() {
  v=$(status_get "$1" | tr -d '\000-\037')
  if [ -n "$v" ]; then
    printf '"%s"' "$(printf '%s' "$v" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  else
    printf null
  fi
}

# A saved value as a JSON number (or null).
json_number() {
  v=$(status_get "$1" | tr -dc 0-9 | sed 's/^0*\([0-9]\)/\1/')
  printf '%s' "${v:-null}"
}

# Free and total bytes of the filesystem holding $1 (nulls if unknown).
json_disk() {
  set -- $(limit 30 df -Pk "$1" 2>/dev/null | awk 'NR == 2 { print $(NF-2), $(NF-4) }')
  case "${1:-x}:${2:-x}" in
    *[!0-9:]*) printf '{ "freeBytes": null, "totalBytes": null }' ;;
    *) printf '{ "freeBytes": %s, "totalBytes": %s }' "$(( $1 * 1024 ))" "$(( $2 * 1024 ))" ;;
  esac
}

# Writes /status/backup.json from the saved values: a temporary file in the
# same folder first, then renamed, so the app never reads half a file.
status_write() {
  configured=false
  copy_error=null
  copy_disk='{ "freeBytes": null, "totalBytes": null }'
  if [ -n "${BACKUP_COPY_CONFIGURED:-}" ]; then
    configured=true
    copy_error=$(json_text copyLastError)
    # Unmounted, the folder is on this server's disk: its size would mislead.
    if copy_marked; then copy_disk=$(json_disk "$copy_dir"); fi
  fi
  json=$(cat <<EOF
{
  "version": 1,
  "updatedAt": "$(status_now)",
  "loopStartedAt": $(json_text loopStartedAt),
  "nextRunAt": $(json_text nextRunAt),
  "keepDays": $keep_days,
  "lastAttemptAt": $(json_text lastAttemptAt),
  "lastSuccessAt": $(json_text lastSuccessAt),
  "lastError": $(json_text lastError),
  "lastFile": $(json_text lastFile),
  "lastSizeBytes": $(json_number lastSizeBytes),
  "disk": $(json_disk "${BACKUP_TARGET:-/backups}"),
  "copy": {
    "configured": $configured,
    "lastAttemptAt": $(json_text copyLastAttemptAt),
    "lastSuccessAt": $(json_text copyLastSuccessAt),
    "lastError": $copy_error,
    "disk": $copy_disk
  }
}
EOF
)
  (
    umask 022
    mkdir -p "$status_dir" || exit 1
    printf '%s\n' "$json" > "$status_dir/.backup.json.$$" && mv -f "$status_dir/.backup.json.$$" "$status_dir/backup.json"
  ) || { rm -f "$status_dir/.backup.json.$$"; echo "warning: could not write $status_dir/backup.json" >&2; }
  return 0
}
