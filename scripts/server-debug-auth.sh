#!/usr/bin/env bash
set -e
cd /var/www/apps/mv-checklist
node <<'NODE'
const Database = require('better-sqlite3');
const { createHash } = require('crypto');
const path = require('path');

const inv = '/var/www/mv-inventory/data/mv-inventory.db';
const db = new Database(path.join('data', 'mv-checklist.db'));
db.exec(`ATTACH DATABASE '${inv.replace(/'/g, "''")}' AS inv`);

const cols = db.prepare("SELECT name FROM pragma_table_info('users','inv')").all().map(r => r.name);
console.log('inv.users cols:', cols.join(', '));

const admin = db.prepare('SELECT id, username, role, is_active, substr(password_hash,1,20) AS hash_prefix, length(password_hash) AS hash_len FROM inv.users WHERE username = ?').get('admin');
console.log('admin row:', admin);

const full = db.prepare('SELECT password_hash FROM inv.users WHERE username = ?').get('admin');
const hash = full?.password_hash || '';
const sha = createHash('sha256').update('admin'.trim()).digest('hex');
console.log('sha256(admin) matches?', hash === sha);
console.log('hash starts with $2?', hash.startsWith('$2'));
console.log('hash looks like hex?', /^[a-f0-9]{64}$/i.test(hash));

// Can checklist attach and see users via view?
try {
  // recreate like app
  db.exec('DROP VIEW IF EXISTS temp.users');
  db.exec('CREATE TEMP VIEW users AS SELECT * FROM inv.users');
  const viaView = db.prepare("SELECT username, is_active FROM users WHERE username='admin'").get();
  console.log('via temp view:', viaView);
} catch (e) {
  console.log('view err', e.message);
}
NODE
