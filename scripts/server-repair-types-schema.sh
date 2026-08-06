#!/usr/bin/env bash
set -euo pipefail
cd /var/www/apps/mv-checklist

node <<'NODE'
const Database = require('better-sqlite3');
const db = new Database('data/mv-checklist.db');
const cols = db.prepare('PRAGMA table_info(checklist_types)').all();
const createdAt = cols.find((c) => c.name === 'created_at');
console.log('before created_at:', createdAt);

const needs =
  createdAt && createdAt.notnull === 1 && createdAt.dflt_value == null;
if (!needs) {
  console.log('No rebuild needed');
  process.exit(0);
}

db.pragma('foreign_keys = OFF');
db.exec(`
  BEGIN;
  CREATE TABLE checklist_types_new (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'clipboard',
    department_tag TEXT,
    frequency TEXT NOT NULL DEFAULT 'daily',
    completer_role TEXT NOT NULL,
    approver_role TEXT NOT NULL,
    is_system INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT INTO checklist_types_new
    (id, slug, label, icon, department_tag, frequency, completer_role,
     approver_role, is_system, is_active, display_order, created_at)
    SELECT COALESCE(id, lower(hex(randomblob(8)))),
           slug, label,
           COALESCE(icon, 'clipboard'),
           department_tag,
           COALESCE(frequency, 'daily'),
           COALESCE(completer_role, 'admin'),
           COALESCE(approver_role, 'admin'),
           COALESCE(is_system, 0),
           COALESCE(is_active, 1),
           COALESCE(display_order, 0),
           COALESCE(created_at, datetime('now'))
    FROM checklist_types;
  DROP TABLE checklist_types;
  ALTER TABLE checklist_types_new RENAME TO checklist_types;
  COMMIT;
`);
db.pragma('foreign_keys = ON');

const after = db.prepare('PRAGMA table_info(checklist_types)').all()
  .find((c) => c.name === 'created_at');
console.log('after created_at:', after);
console.log('types:', db.prepare('SELECT COUNT(*) as c FROM checklist_types').get());
NODE

pm2 restart mv-checklist
sleep 2
curl -sk -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}' \
  -w "\nhttp=%{http_code}\n" \
  https://127.0.0.1:3005/api/auth
echo
pm2 logs mv-checklist --lines 10 --nostream || true
echo DONE
