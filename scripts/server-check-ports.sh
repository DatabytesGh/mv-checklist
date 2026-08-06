#!/usr/bin/env bash
echo "=== listening ports ==="
ss -ltnp | grep -E '300[0-9]|node' || true
echo "=== pm2 checklist logs ==="
pm2 logs mv-checklist --lines 40 --nostream || true
echo "=== who owns 3004 ==="
ss -ltnp | grep 3004 || true
ps -fp 466400 || true
ps -fp 600633 || true
