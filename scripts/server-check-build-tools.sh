#!/usr/bin/env bash
set -e
echo "make: $(command -v make || echo MISSING)"
echo "g++: $(command -v g++ || echo MISSING)"
echo "python3: $(command -v python3 || echo MISSING)"
node -e 'console.log("inv better-sqlite3", require("/var/www/mv-inventory/node_modules/better-sqlite3/package.json").version)'
ls /var/www/mv-inventory/node_modules/better-sqlite3/build/Release 2>/dev/null || echo "no Release dir"
grep better-sqlite3 /var/www/mv-inventory/package.json
grep better-sqlite3 /var/www/apps/mv-checklist/package.json
