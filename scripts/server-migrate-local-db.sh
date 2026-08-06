#!/usr/bin/env bash
# Replace server checklist DB with an uploaded local copy (after backup).
set -euo pipefail
APP=/var/www/apps/mv-checklist
DATA="$APP/data"
SRC="${1:-/tmp/mv-checklist-from-local.db}"
TS=$(date +%Y%m%d-%H%M%S)

if [[ ! -f "$SRC" ]]; then
  echo "Missing source DB: $SRC" >&2
  exit 1
fi

echo "==> Stopping mv-checklist"
pm2 stop mv-checklist

echo "==> Checkpoint + backup current server DB"
cd "$APP"
node -e "
const Database=require('better-sqlite3');
try {
  const db=new Database('data/mv-checklist.db');
  console.log('checkpoint', db.pragma('wal_checkpoint(TRUNCATE)'));
  db.close();
} catch (e) { console.log('checkpoint skip:', e.message); }
"
mkdir -p "$DATA/backups"
cp -a "$DATA/mv-checklist.db" "$DATA/backups/mv-checklist.db.before-local-migrate-$TS"
# drop wal/shm so the new main file is authoritative
rm -f "$DATA/mv-checklist.db-wal" "$DATA/mv-checklist.db-shm"

echo "==> Installing local DB"
cp -a "$SRC" "$DATA/mv-checklist.db"
chmod 644 "$DATA/mv-checklist.db"

echo "==> Starting app (migrations run on boot)"
pm2 start mv-checklist
sleep 3

echo "==> Post-migrate counts"
node scripts/db-counts.js data/mv-checklist.db

echo "==> Login smoke test"
curl -sk -H "Content-Type: application/json" \
  --data-binary '{"username":"admin","password":"admin"}' \
  -w "\nhttp=%{http_code}\n" \
  https://127.0.0.1:3005/api/auth

echo "DONE. Backup: $DATA/backups/mv-checklist.db.before-local-migrate-$TS"
