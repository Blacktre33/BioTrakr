#!/bin/sh
# One backup now: a compressed pg_dump in /backups, a second copy in
# BACKUP_COPY_DIR if one is set, then old ones pruned. Every run is recorded
# in /status/backup.json, which the app reads to warn administrators.
# Run by backup-loop.sh every night, or by hand:
#   docker compose exec backup sh /scripts/backup.sh
set -eu
# Backups hold staff details and password hashes: readable by root only.
umask 077
. "$(dirname "$0")/status-file.sh"

dir="${BACKUP_TARGET:-/backups}"
stamp=$(date +%Y-%m-%d_%H%M%S)
name="biotrakr_${stamp}.dump"
file="${dir}/${name}"
tmp="${file}.partial"
errlog=""
step="the backup could not start"   # what is being done, for the error message
dump_ok=""
problems=""

# However the script ends before the dump is safe (a failed command under
# set -e, Ctrl-C), record why, so the app can tell someone.
finish() {
  code=$?
  set +e
  rm -f "$tmp"
  if [ -z "$dump_ok" ]; then
    [ "$code" -ne 0 ] || code=1
    reason="$step"
    detail=$([ -z "$errlog" ] || tail -n 3 "$errlog" 2>/dev/null)
    [ -n "$detail" ] && reason="$reason: $detail"
    status_set_error lastError "$reason"
    status_write
    echo "$(date -Iseconds) BACKUP FAILED: $(status_get lastError)" >&2
  fi
  [ -z "$errlog" ] || rm -f "$errlog"
  exit "$code"
}
trap finish EXIT
trap 'step="$step (interrupted)"; exit 130' INT TERM HUP

# Runs one command, keeping its error output for the status file (and
# showing it in the log as usual).
run() {
  rc=0
  "$@" 2> "$errlog" || rc=$?
  cat "$errlog" >&2
  return "$rc"
}

# Something after the dump went wrong: carry on, but fail the run at the end.
problem() {
  echo "$(date -Iseconds) PROBLEM: $1" >&2
  problems=1
}

status_set lastAttemptAt "$(status_now)"
status_write

step="could not make a temporary file"
errlog=$(mktemp)
step="could not create the backup folder $dir"
run mkdir -p "$dir"
step="the database dump failed"
run pg_dump --format=custom --compress=6 --file="$tmp" "$PGDATABASE"
# A dump that cannot be listed is not a backup (this checks it is complete
# and readable; only a test restore proves the data, see the guide).
step="the new dump could not be read back"
run pg_restore --list "$tmp" > /dev/null
step="could not save the dump as $file"
run mv "$tmp" "$file"
size=$(wc -c < "$file" | tr -dc 0-9)

dump_ok=1
status_set lastSuccessAt "$(status_now)"
status_set lastError ""
status_set lastFile "$name"
status_set lastSizeBytes "$size"
status_write
echo "$(date -Iseconds) backup written: $file ($(du -h "$file" | cut -f1))"

# From here on the dump is safe. Each step below reports its own trouble;
# one failing does not stop the others (above all, not the second copy).

# The HTTPS certificate authority (if BioTrakr made its own): losing it
# means installing a new root certificate on every phone and PC.
if [ -d /caddy/caddy/pki ]; then
  if run tar czf "${dir}/caddy-pki.tgz.partial" -C /caddy/caddy pki \
      && run mv "${dir}/caddy-pki.tgz.partial" "${dir}/caddy-pki.tgz"; then
    :
  else
    problem "could not save the HTTPS certificate authority (caddy-pki.tgz)"
  fi
fi

run find "$dir" -name 'biotrakr_*.dump' -mtime +"$keep_days" -print -delete \
  || problem "could not remove backups older than $keep_days days from $dir"
run find "$dir" -name '*.partial' -mmin +60 -print -delete \
  || problem "could not remove unfinished files from $dir"

# The second copy. Each file goes in under a temporary name, is checked,
# then renamed, so a half-written copy never looks like a backup. Sets
# copy_err and returns 1 on the first thing that goes wrong. Every command
# there has a time limit (see status-file.sh): hours for the copy itself.
copy_err=""
copy_fail() {
  copy_err="$1"
  if [ "$rc" -eq 137 ]; then
    copy_err="$copy_err: no answer from the copy location (timed out)"
  else
    detail=$(tail -n 3 "$errlog" 2>/dev/null)
    [ -n "$detail" ] && copy_err="$copy_err: $detail"
  fi
  [ -z "$part" ] || limit 60 rm -f "$part" 2>/dev/null
  return 1
}
copy_file() {
  base=$(basename "$1")
  part="$copy_dir/$base.partial"
  run limit 21600 cp "$1" "$part" || { copy_fail "could not copy $base"; return 1; }
  want=$(stat -c %s "$1" 2>/dev/null)
  got=$(limit 60 stat -c %s "$part" 2>/dev/null)
  if [ -z "$want" ] || [ "$want" != "$got" ]; then
    : > "$errlog"; rc=1
    copy_fail "the copy of $base is incomplete (${got:-0} of ${want:-?} bytes)"; return 1
  fi
  case "$base" in
    *.dump) run limit 600 pg_restore --list "$part" > /dev/null || { copy_fail "the copy of $base could not be read back"; return 1; } ;;
    *.tgz) run limit 600 tar tzf "$part" > /dev/null || { copy_fail "the copy of $base could not be read back"; return 1; } ;;
  esac
  run limit 60 mv -f "$part" "$copy_dir/$base" || { copy_fail "could not rename the copy of $base"; return 1; }
}
copy_backup() {
  part=""; rc=0
  if ! copy_marked; then
    copy_err="copy location is not mounted (no $copy_marker file in BACKUP_COPY_DIR)"
    return 1
  fi
  copy_file "$file" || return 1
  if [ -f "${dir}/caddy-pki.tgz" ]; then copy_file "${dir}/caddy-pki.tgz" || return 1; fi
  # Not into subfolders: NAS snapshot folders (.snapshot, #snapshot) are read-only.
  part=""
  run limit 600 find "$copy_dir" -maxdepth 1 -name 'biotrakr_*.dump' -mtime +"$keep_days" -print -delete \
    || { copy_fail "could not remove copies older than $keep_days days"; return 1; }
  run limit 600 find "$copy_dir" -maxdepth 1 -name '*.partial' -mmin +60 -print -delete \
    || { copy_fail "could not remove unfinished copies"; return 1; }
}

if [ -n "${BACKUP_COPY_CONFIGURED:-}" ]; then
  status_set copyLastAttemptAt "$(status_now)"
  status_write
  if copy_backup; then
    status_set copyLastSuccessAt "$(status_now)"
    status_set copyLastError ""
    echo "$(date -Iseconds) second copy written to BACKUP_COPY_DIR"
  else
    status_set_error copyLastError "$copy_err"
    problem "SECOND COPY FAILED: $(status_get copyLastError)"
  fi
fi
# Again, so the free space shown is after the old backups were removed.
status_write

if [ -n "$problems" ]; then
  echo "$(date -Iseconds) the backup itself is safe in $dir, but the run had problems (above)" >&2
  exit 1
fi

if [ -n "${BACKUP_PING_URL:-}" ]; then
  # Optional: tell a monitor (e.g. Uptime Kuma, healthchecks.io) it worked.
  wget -q -O /dev/null "$BACKUP_PING_URL" || echo "could not reach BACKUP_PING_URL"
fi
