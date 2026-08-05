#!/usr/bin/env bash
# Backup to NAS, then pull/build/reload a registered app.
set -euo pipefail

APP_NAME="${1:-}"
CONF="${APP_BACKUP_CONF:-/etc/app-backup.conf}"
BACKUP_BIN="${BACKUP_BIN:-/usr/local/bin/backup-apps.sh}"
export BACKUP_HOST_ID="${BACKUP_HOST_ID:-192.168.1.11}"
export NAS_BACKUP_ROOT="${NAS_BACKUP_ROOT:-/mnt/nas/backups}"

die() { echo "ERROR: $*" >&2; exit 1; }
log() { printf '[%s] %s\n' "$(date -Iseconds)" "$*"; }

[[ -n "$APP_NAME" ]] || die "usage: $0 <app-name>"
[[ -f "$CONF" ]] || die "missing config: $CONF"
[[ -x "$BACKUP_BIN" ]] || die "missing backup script: $BACKUP_BIN"

ROOT=""
PM2_NAME=""
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  IFS='|' read -r name root sqlite_csv upload_csv pm2_name <<< "$line"
  name="$(echo "$name" | xargs)"
  if [[ "$name" == "$APP_NAME" ]]; then
    ROOT="$(echo "$root" | xargs)"
    PM2_NAME="$(echo "${pm2_name:-$name}" | xargs)"
    break
  fi
done < "$CONF"

[[ -n "$ROOT" ]] || die "app not found in $CONF: $APP_NAME"
[[ -d "$ROOT" ]] || die "app root missing: $ROOT"

log "Pre-deploy backup for $APP_NAME"
"$BACKUP_BIN" deploy "$APP_NAME"

cd "$ROOT"

if [[ -d .git ]]; then
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  log "git pull origin $BRANCH"
  git pull --ff-only origin "$BRANCH"
else
  log "WARN: not a git repo; skipping pull"
fi

if [[ -f package.json ]]; then
  if [[ -f package-lock.json ]]; then
    log "npm ci"
    npm ci
  else
    log "npm install"
    npm install
  fi
  if grep -q '"build"' package.json; then
    log "npm run build"
    npm run build
  fi
fi

# PM2 apps run as the app directory owner (administrator), not root.
# When this script is invoked via sudo, reload through that user.
run_pm2() {
  local app_user
  app_user="$(stat -c '%U' "$ROOT" 2>/dev/null || echo administrator)"
  if [[ "$(id -u)" -eq 0 && "$app_user" != "root" ]]; then
    sudo -u "$app_user" --preserve-env=HOME,PATH env HOME="$(getent passwd "$app_user" | cut -d: -f6)" pm2 "$@"
  else
    pm2 "$@"
  fi
}

if command -v pm2 >/dev/null 2>&1; then
  if run_pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
    log "pm2 reload $PM2_NAME"
    run_pm2 reload "$PM2_NAME"
  elif [[ -f ecosystem.config.cjs ]]; then
    log "pm2 reload ecosystem.config.cjs"
    run_pm2 reload ecosystem.config.cjs
  elif [[ -f ecosystem.config.js ]]; then
    log "pm2 reload ecosystem.config.js"
    run_pm2 reload ecosystem.config.js
  else
    log "WARN: PM2 process '$PM2_NAME' not found; start it manually as the app user"
    log "  e.g. pm2 start npm --name $PM2_NAME -- start   (from $ROOT, without sudo)"
  fi
else
  log "WARN: pm2 not installed; reload the app process manually"
fi

log "Deploy complete: $APP_NAME"
