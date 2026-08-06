#!/usr/bin/env bash
set -euo pipefail

APP=/var/www/apps/mv-checklist
INV=/var/www/mv-inventory

cd "$APP"
git fetch origin main
git reset --hard origin/main
mkdir -p data public/uploads certs

# Keep existing .env.local if present; otherwise create
if [ ! -f .env.local ]; then
  SESSION_SECRET="$(openssl rand -hex 24)"
  {
    echo "# Generated on server $(date -Iseconds)"
    echo "PORT=3004"
    echo "NODE_ENV=production"
    echo "SESSION_SECRET=${SESSION_SECRET}"
    echo "MV_DB_PATH=${APP}/data/mv-checklist.db"
    echo "MV_INVENTORY_DB_PATH=${INV}/data/mv-inventory.db"
    echo "META_WA_TEMPLATE_PREFIX=mmv_"
    echo "META_WA_TEMPLATE_LANGS=en_US,en_GB,en"
  } > .env.local
  if [ -f "$INV/.env" ]; then
    grep '^META_WA_TOKEN=' "$INV/.env" >> .env.local || true
    grep '^META_WA_PHONE_ID=' "$INV/.env" >> .env.local || true
    grep '^META_WA_WABA_ID=' "$INV/.env" >> .env.local || true
  fi
  chmod 600 .env.local
fi

echo "=== npm ci (ignore native scripts) ==="
npm ci --ignore-scripts

echo "=== reuse inventory better-sqlite3 native binary ==="
SRC="$INV/node_modules/better-sqlite3"
DST="$APP/node_modules/better-sqlite3"
if [ ! -f "$SRC/build/Release/better_sqlite3.node" ]; then
  echo "ERROR: inventory better-sqlite3 binary missing"
  exit 1
fi
rm -rf "$DST/build"
mkdir -p "$DST/build/Release"
cp -a "$SRC/build/Release/better_sqlite3.node" "$DST/build/Release/"
# also copy prebuilds if present
if [ -d "$SRC/prebuilds" ]; then
  rm -rf "$DST/prebuilds"
  cp -a "$SRC/prebuilds" "$DST/prebuilds"
fi

node -e 'require("better-sqlite3"); console.log("better-sqlite3 OK")'

echo "=== build ==="
npm run build

if pm2 describe mv-checklist >/dev/null 2>&1; then
  pm2 delete mv-checklist || true
fi
pm2 start ecosystem.config.cjs
pm2 save

sleep 2
pm2 status mv-checklist
ss -ltnp | grep 3004 || true
curl -sk -o /dev/null -w "login_https=%{http_code}\n" https://127.0.0.1:3004/login || true
echo "APP_DIR=${APP}"
echo "DONE"
