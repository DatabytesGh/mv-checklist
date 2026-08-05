#!/usr/bin/env bash
# Non-destructive restore drill: restore latest NAS snapshot into /tmp and verify SQLite.
# Does NOT stop production apps or overwrite live data.
set -euo pipefail

NAS_ROOT="${NAS_BACKUP_ROOT:-/mnt/nas/backups}"
HOST_ID="${BACKUP_HOST_ID:-192.168.1.11}"
MODE="nightly"
APP_NAME=""
AUTO=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --deploy) MODE=deploy; shift ;;
    --nightly) MODE=nightly; shift ;;
    --app) APP_NAME="${2:-}"; shift 2 ;;
    --auto) AUTO=1; shift ;;
    *) echo "usage: $0 [--nightly|--deploy] [--app name] [--auto]"; exit 1 ;;
  esac
done

log() { printf '[%s] %s\n' "$(date -Iseconds)" "$*"; }
die() { log "ERROR: $*"; exit 1; }

mountpoint -q "$NAS_ROOT" || die "NAS not mounted at $NAS_ROOT"

BASE="$NAS_ROOT/$HOST_ID/$MODE"
[[ -d "$BASE" ]] || die "no $MODE backups under $BASE"

LATEST="$(ls -1dt "$BASE"/*/ 2>/dev/null | head -1 || true)"
[[ -n "$LATEST" ]] || die "no snapshots in $BASE"
LATEST="${LATEST%/}"

if [[ -z "$APP_NAME" ]]; then
  APP_NAME="$(find "$LATEST" -mindepth 1 -maxdepth 1 -type d ! -name '.*' -printf '%f\n' | head -1 || true)"
fi
[[ -n "$APP_NAME" ]] || die "could not determine app name"

SRC="$LATEST/$APP_NAME"
[[ -d "$SRC" ]] || die "missing app snapshot: $SRC"

WORK="$(mktemp -d "/tmp/restore-drill-${APP_NAME}.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

log "Drill source: $SRC"
log "Work dir: $WORK"
mkdir -p "$WORK"/{db,uploads,env}
[[ -d "$SRC/db" ]] && rsync -a "$SRC/db/" "$WORK/db/"
[[ -d "$SRC/uploads" ]] && rsync -a "$SRC/uploads/" "$WORK/uploads/"
[[ -d "$SRC/env" ]] && rsync -a "$SRC/env/" "$WORK/env/"
cp -a "$SRC/MANIFEST.txt" "$WORK/MANIFEST.txt" 2>/dev/null || true

OK=0
FAIL=0
shopt -s nullglob
for db in "$WORK"/db/*.db "$WORK"/db/*/*.db; do
  [[ -f "$db" ]] || continue
  if command -v sqlite3 >/dev/null 2>&1; then
    if sqlite3 "$db" 'PRAGMA integrity_check;' | grep -qx 'ok'; then
      log "OK sqlite integrity: $db"
      OK=$((OK + 1))
    else
      log "FAIL sqlite integrity: $db"
      FAIL=$((FAIL + 1))
    fi
  else
    log "WARN sqlite3 missing; size check only for $db ($(stat -c%s "$db") bytes)"
    OK=$((OK + 1))
  fi
done
shopt -u nullglob

UPLOAD_COUNT="$(find "$WORK/uploads" -type f 2>/dev/null | wc -l | tr -d ' ')"
ENV_COUNT="$(find "$WORK/env" -type f 2>/dev/null | wc -l | tr -d ' ')"
log "uploads files: $UPLOAD_COUNT"
log "env files: $ENV_COUNT"
log "manifest:"; sed 's/^/  /' "$WORK/MANIFEST.txt" 2>/dev/null || true

if (( FAIL > 0 )); then
  die "restore drill failed ($FAIL bad db(s))"
fi
if (( OK == 0 && AUTO == 1 )); then
  log "WARN: no sqlite DBs verified (snapshot may be env/uploads only)"
fi

log "RESTORE DRILL PASSED for $APP_NAME from $MODE@$LATEST"
echo "$WORK"
