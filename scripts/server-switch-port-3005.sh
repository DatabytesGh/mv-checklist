#!/usr/bin/env bash
set -euo pipefail
APP=/var/www/apps/mv-checklist
cd "$APP"

# Switch to free port 3005 (3004 = databytes-api)
if grep -q '^PORT=' .env.local; then
  sed -i 's/^PORT=.*/PORT=3005/' .env.local
else
  echo 'PORT=3005' >> .env.local
fi

# Update ecosystem
python3 - <<'PY'
from pathlib import Path
p = Path("ecosystem.config.cjs")
text = p.read_text()
text = text.replace('PORT: "3004"', 'PORT: "3005"')
p.write_text(text)
print("ecosystem PORT -> 3005")
PY

pm2 delete mv-checklist || true
pm2 start ecosystem.config.cjs --update-env
pm2 save
sleep 2
pm2 status mv-checklist
ss -ltnp | grep 3005 || true
curl -sk -o /dev/null -w "login_https=%{http_code}\n" https://127.0.0.1:3005/login || true
pm2 logs mv-checklist --lines 15 --nostream || true
echo DONE
