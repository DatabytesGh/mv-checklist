#!/usr/bin/env bash
# Discover apps/DBs/uploads/PM2 on this host and print a draft app-backup.conf
set -euo pipefail

echo "=== host ==="
hostname; uname -a; date -Iseconds
echo

echo "=== listening ports (node/nginx) ==="
ss -tlnp 2>/dev/null | grep -E ':(80|443|3000|3002|3003|3010)\s' || true
echo

echo "=== pm2 ==="
if command -v pm2 >/dev/null 2>&1; then
  pm2 list || true
  pm2 jlist 2>/dev/null | head -c 4000 || true
  echo
else
  echo "(pm2 not installed)"
fi

echo "=== docker ==="
if command -v docker >/dev/null 2>&1; then
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}' || true
else
  echo "(docker not installed)"
fi
echo

echo "=== mounts / nas ==="
findmnt "$NAS_BACKUP_ROOT" 2>/dev/null || true
mount | grep -iE 'cifs|nfs|nas|backup' || true
df -h | head -20
echo

echo "=== candidate app roots ==="
CANDIDATES=()
for d in /opt/apps /var/www /home/*/apps /home/*/projects /home/*; do
  for path in $d; do
    [[ -d "$path" ]] || continue
    CANDIDATES+=("$path")
  done
done

# also PM2 cwd
if command -v pm2 >/dev/null 2>&1; then
  while IFS= read -r cwd; do
    [[ -n "$cwd" && -d "$cwd" ]] && CANDIDATES+=("$cwd")
  done < <(pm2 jlist 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); print("\n".join(p.get("pm2_env",{}).get("pm_cwd","") for p in d))' 2>/dev/null || true)
fi

printf '%s\n' "${CANDIDATES[@]}" | sort -u
echo

echo "=== draft /etc/app-backup.conf ==="
echo "# name|app_root|sqlite_paths_csv|upload_paths_csv|pm2_name"
declare -A SEEN=()
while IFS= read -r root; do
  [[ -z "$root" || ! -d "$root" ]] && continue
  [[ -n "${SEEN[$root]:-}" ]] && continue
  SEEN[$root]=1

  # skip home junk
  base="$(basename "$root")"
  [[ "$base" == "." || "$base" == ".." ]] && continue

  dbs=()
  while IFS= read -r db; do
    rel="${db#"$root"/}"
    dbs+=("$rel")
  done < <(find "$root" -maxdepth 3 -type f \( -name '*.db' -o -name '*.sqlite' -o -name '*.sqlite3' \) 2>/dev/null | head -20)

  ups=()
  for u in public/uploads uploads data/uploads storage/uploads; do
    [[ -d "$root/$u" ]] && ups+=("$u")
  done

  ((${#dbs[@]})) || continue

  pm2_name="$base"
  if command -v pm2 >/dev/null 2>&1; then
    maybe="$(pm2 jlist 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin);
for p in d:
  if p.get('pm2_env',{}).get('pm_cwd')=='''$root''':
    print(p.get('name','')); break" 2>/dev/null || true)"
    [[ -n "$maybe" ]] && pm2_name="$maybe"
  fi

  IFS=','; db_csv="${dbs[*]-}"; unset IFS
  IFS=','; up_csv="${ups[*]-}"; unset IFS
  echo "${base}|${root}|${db_csv}|${up_csv}|${pm2_name}"
done < <(printf '%s\n' "${CANDIDATES[@]}" | sort -u)
