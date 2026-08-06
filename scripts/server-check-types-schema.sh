#!/usr/bin/env bash
set -e
cd /var/www/apps/mv-checklist
node <<'NODE'
const Database = require('better-sqlite3');
const db = new Database('data/mv-checklist.db');
const cols = db.prepare('PRAGMA table_info(checklist_types)').all();
console.log(JSON.stringify(cols, null, 2));
const count = db.prepare('SELECT COUNT(*) as c FROM checklist_types').get();
console.log('count', count);
NODE
