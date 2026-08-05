#!/usr/bin/env bash
# Backup registered apps to NAS (nightly or deploy mode).
set -euo pipefail

MODE="${1:-nightly}"
APP_FILTER="${2:-}" # optional app name
CONF="${APP_BACKUP_CONF:-/etc/app-backup.conf}"
NAS_ROOT="${NAS_BACKUP_ROOT:-/mnt/nas/backups}"
HOST_ID="${BACKUP_HOST_ID:-192.168.1.11}"
NIGHTLY_KEEP_DAYS="${NIGHTLY_KEEP_DAYS:-14}"
DEPLOY_KEEP_COUNT="${DEPLOY_KEEP_COUNT:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"

log() { printf '[%s] %s\n' "$(date -Iseconds)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

[[ "$MODE" == "nightly" || "$MODE" == "deploy" ]] || die "usage: $0 <nightly|deploy> [app-name]"
[[ -f "$CONF" ]] || die "missing config: $CONF"
[[ -d "$NAS_ROOT" ]] || die "NAS mount missing: $NAS_ROOT"
mountpoint -q "$NAS_ROOT" || die "NAS path is not a mountpoint: $NAS_ROOT"
[[ -w "$NAS_ROOT" ]] || die "NAS path not writable: $NAS_ROOT"

DEST_BASE="$NAS_ROOT/$HOST_ID/$MODE/$STAMP"
mkdir -p "$DEST_BASE"

backup_sqlite() {
  local src="$1" dest_dir="$2"
  local base out attempt
  base="$(basename "$src")"
  out="$dest_dir/$base"
  mkdir -p "$dest_dir"
  if command -v sqlite3 >/dev/null 2>&1; then
    for attempt in 1 2 3 4 5; do
      if sqlite3 -cmd ".timeout 30000" "$src" ".backup '$out'" 2>/dev/null; then
        chmod 0644 "$out" 2>/dev/null || true
        return 0
      fi
      log "WARN: sqlite busy ($src), retry $attempt/5"
      sleep $((attempt * 2))
    done
    log "WARN: sqlite .backup failed; falling back to cold copy of $src"
  fi
  cp -a "$src" "$out"
  [[ -f "${src}-wal" ]] && cp -a "${src}-wal" "$dest_dir/"
  [[ -f "${src}-shm" ]] && cp -a "${src}-shm" "$dest_dir/"
  chmod 0644 "$out" "${out}-wal" "${out}-shm" 2>/dev/null || true
}

backup_postgres_if_configured() {
  local name="$1" root="$2" app_dest="$3"
  local env_file="" url=""
  for env_file in "$root/.env" "$root/.env.local"; do
    [[ -f "$env_file" ]] || continue
    # shellcheck disable=SC1090
    url="$(grep -E '^(DATABASE_URL|POSTGRES_URL)=' "$env_file" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
    [[ -n "$url" ]] && break
  done
  [[ -n "$url" ]] || return 0
  if ! command -v pg_dump >/dev/null 2>&1; then
    log "WARN $name: DATABASE_URL set but pg_dump missing"
    return 0
  fi
  mkdir -p "$app_dest/db"
  if pg_dump "$url" --no-owner --no-acl -F c -f "$app_dest/db/${name}.pg.dump" 2>/dev/null; then
    chmod 0644 "$app_dest/db/${name}.pg.dump" 2>/dev/null || true
    log "PG  $name: dump ok"
  else
    log "WARN $name: pg_dump failed"
  fi
}

backup_one() {
  local name="$1" root="$2" sqlite_csv="$3" upload_csv="$4"
  local app_dest="$DEST_BASE/$name"
  local commit="n/a"
  local wrote=0

  [[ -d "$root" ]] || { log "SKIP $name: root missing ($root)"; return 0; }
  mkdir -p "$app_dest"

  if [[ -d "$root/.git" ]] && command -v git >/dev/null 2>&1; then
    commit="$(git -C "$root" rev-parse --short HEAD 2>/dev/null || echo n/a)"
  fi

  # SQLite — only create db/ when we actually back something up
  if [[ -n "$sqlite_csv" ]]; then
    IFS=',' read -r -a dbs <<< "$sqlite_csv"
    for rel in "${dbs[@]}"; do
      [[ -z "$rel" ]] && continue
      local src="$root/$rel"
      if [[ -f "$src" ]]; then
        backup_sqlite "$src" "$app_dest/db"
        printf '%s\n' "$rel" > "$app_dest/db/$(basename "$rel").path"
        chmod 0644 "$app_dest/db/$(basename "$rel").path" 2>/dev/null || true
        wrote=1
        log "DB  $name: $rel"
      else
        log "WARN $name: db missing $rel"
      fi
    done
  fi

  # Uploads — only when path exists and has content
  if [[ -n "$upload_csv" ]]; then
    IFS=',' read -r -a ups <<< "$upload_csv"
    for rel in "${ups[@]}"; do
      [[ -z "$rel" ]] && continue
      local src="$root/$rel"
      if [[ -d "$src" ]]; then
        mkdir -p "$app_dest/uploads/$rel"
        rsync -a "$src/" "$app_dest/uploads/$rel/"
        find "$app_dest/uploads" -type f -exec chmod 0644 {} \; 2>/dev/null || true
        wrote=1
        log "UP  $name: $rel"
      elif [[ -e "$src" ]]; then
        mkdir -p "$app_dest/uploads/$(dirname "$rel")"
        rsync -a "$src" "$app_dest/uploads/$rel"
        chmod 0644 "$app_dest/uploads/$rel" 2>/dev/null || true
        wrote=1
        log "UP  $name: $rel (file)"
      else
        log "WARN $name: upload path missing $rel"
      fi
    done
  fi

  # Env / secrets — only create env/ when files exist
  shopt -s nullglob
  local env_files=("$root"/.env "$root"/.env.local "$root"/.env.production "$root"/.env.production.local)
  local has_env=0
  for f in "${env_files[@]}"; do
    [[ -f "$f" ]] || continue
    mkdir -p "$app_dest/env"
    cp -a "$f" "$app_dest/env/"
    chmod 0644 "$app_dest/env/$(basename "$f")" 2>/dev/null || true
    has_env=1
    wrote=1
    log "ENV $name: $(basename "$f")"
  done
  shopt -u nullglob

  # Optional Postgres dump when DATABASE_URL is present
  backup_postgres_if_configured "$name" "$root" "$app_dest" && wrote=1 || true

  # Project files: always for deploy mode; nightly only if BACKUP_CODE=1
  if [[ "$MODE" == "deploy" || "${BACKUP_CODE:-0}" == "1" ]]; then
    mkdir -p "$app_dest/code"
    rsync -a \
      --exclude node_modules \
      --exclude .next \
      --exclude .git \
      --exclude dist \
      --exclude build \
      --exclude coverage \
      --exclude '.turbo' \
      --exclude 'data/*.db' \
      --exclude 'data/*.db-*' \
      --exclude '*.db' \
      --exclude '*.db-wal' \
      --exclude '*.db-shm' \
      "$root/" "$app_dest/code/"
    # Prefer readable perms in Synology File Station
    find "$app_dest/code" -type f -exec chmod 0644 {} \; 2>/dev/null || true
    find "$app_dest/code" -type d -exec chmod 0755 {} \; 2>/dev/null || true
    wrote=1
    log "CODE $name: project files -> code/"
  fi

  {
    echo "app=$name"
    echo "root=$root"
    echo "mode=$MODE"
    echo "host=$HOST_ID"
    echo "timestamp=$STAMP"
    echo "git_commit=$commit"
    echo "hostname=$(hostname)"
    echo "has_payload=$wrote"
  } > "$app_dest/MANIFEST.txt"
  chmod 0644 "$app_dest/MANIFEST.txt" 2>/dev/null || true
}

# Parse config: name|app_root|sqlite_paths_csv|upload_paths_csv|pm2_name(optional)
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  IFS='|' read -r name root sqlite_csv upload_csv pm2_name <<< "$line"
  name="$(echo "$name" | xargs)"
  root="$(echo "$root" | xargs)"
  sqlite_csv="$(echo "${sqlite_csv:-}" | xargs)"
  upload_csv="$(echo "${upload_csv:-}" | xargs)"
  [[ -n "$APP_FILTER" && "$name" != "$APP_FILTER" ]] && continue
  backup_one "$name" "$root" "$sqlite_csv" "$upload_csv"
done < "$CONF"

{
  echo "mode=$MODE"
  echo "timestamp=$STAMP"
  echo "host=$HOST_ID"
  echo "dest=$DEST_BASE"
  echo "filter=${APP_FILTER:-all}"
} > "$DEST_BASE/MANIFEST.txt"
chmod 0644 "$DEST_BASE/MANIFEST.txt" 2>/dev/null || true

# Retention
if [[ "$MODE" == "nightly" ]]; then
  find "$NAS_ROOT/$HOST_ID/nightly" -mindepth 1 -maxdepth 1 -type d -mtime "+$NIGHTLY_KEEP_DAYS" -exec rm -rf {} + 2>/dev/null || true
else
  mapfile -t snaps < <(ls -1dt "$NAS_ROOT/$HOST_ID/deploy"/*/ 2>/dev/null || true)
  if ((${#snaps[@]} > DEPLOY_KEEP_COUNT)); then
    for old in "${snaps[@]:DEPLOY_KEEP_COUNT}"; do
      rm -rf "$old"
    done
  fi
fi

log "OK $MODE backup -> $DEST_BASE"
echo "$DEST_BASE"
