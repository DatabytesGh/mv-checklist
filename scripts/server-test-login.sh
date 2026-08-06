#!/usr/bin/env bash
set -e
cd /var/www/apps/mv-checklist

echo "=== curl login ==="
curl -sk -c /tmp/mv-ck.txt -b /tmp/mv-ck.txt \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}' \
  -w "\nhttp=%{http_code}\n" \
  https://127.0.0.1:3005/api/auth

echo
echo "=== authenticate via app getDb ==="
node <<'NODE'
const { getDb } = require('./src/lib/db.ts');
NODE
# Use compiled path? better require through a small script that uses the same logic
node <<'NODE'
const Database = require('better-sqlite3');
const { createHash } = require('crypto');
const path = require('path');
const fs = require('fs');

// mimic resolve paths from env
require('dotenv')?.config?.({ path: '.env.local' });
const env = Object.fromEntries(
  fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(Boolean).filter(l=>!l.startsWith('#')).map(l=>{
    const i=l.indexOf('='); return [l.slice(0,i), l.slice(i+1)];
  })
);
console.log('MV_INVENTORY_DB_PATH', env.MV_INVENTORY_DB_PATH);
console.log('MV_DB_PATH', env.MV_DB_PATH);
console.log('exists inv', fs.existsSync(env.MV_INVENTORY_DB_PATH));

const dbPath = env.MV_DB_PATH;
const db = new Database(dbPath);
const inv = env.MV_INVENTORY_DB_PATH.replace(/\\/g,'/').replace(/'/g,"''");
db.exec(`ATTACH DATABASE '${inv}' AS inv`);
db.exec('DROP VIEW IF EXISTS temp.users');
db.exec('CREATE TEMP VIEW users AS SELECT * FROM inv.users');

const cols = db.prepare('PRAGMA table_info(users)').all().map(c=>c.name);
console.log('view cols via PRAGMA table_info(users):', cols.join(', '));
const hasInvSchema = cols.includes('password_hash') && cols.includes('full_name');
console.log('usesInventoryUserSchema?', hasInvSchema);

const row = db.prepare(`SELECT id, username, password_hash, role, full_name as display_name, phone, is_active as active FROM users WHERE username = ? COLLATE NOCASE`).get('admin');
console.log('selected:', { id: row?.id, username: row?.username, active: row?.active, role: row?.role, hashLen: row?.password_hash?.length });
const ok = row && row.active && row.password_hash === createHash('sha256').update('admin').digest('hex');
console.log('auth would succeed?', !!ok);
NODE

echo
echo "=== recent auth errors ==="
pm2 logs mv-checklist --lines 30 --nostream | tail -40
