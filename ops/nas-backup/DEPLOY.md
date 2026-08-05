# Deploy guide — 192.168.1.11 (with NAS backup)

Server: `administrator@192.168.1.11`  
SSH alias (this PC): `ssh mv-server`  
NAS backups: `//192.168.1.136/Backups/192.168.1.11/{nightly,deploy}/`

Every deploy runs a **NAS snapshot first**, then pull → install → build → PM2 reload.

---

## Apps on this server

| Deploy name | Path on server | GitHub | Branch | PM2 process |
|-------------|----------------|--------|--------|-------------|
| `mv-inventory` | `/var/www/mv-inventory` | [DatabytesGh/mv-inventory](https://github.com/DatabytesGh/mv-inventory) | `main` | `mv-inventory` |
| `dos-service-desk` | `/var/www/dos-service-desk` | [DatabytesGh/DOS-Service-Desk](https://github.com/DatabytesGh/DOS-Service-Desk) | `main` | `dos-service-desk` |
| *(databytes monorepo)* | `/var/www/databytes` | [DatabytesGh/-databytes-meal-voting](https://github.com/DatabytesGh/-databytes-meal-voting) | `master` | `databytes-api` + `databytes-web` |

`mv-checklist` is **not** on this server yet.

---

## Standard deploy (mv-inventory or dos-service-desk)

### 1. On your PC — commit and push

```bash
cd path/to/repo
git status
git add .
git commit -m "Describe the change"
git push origin main
```

### 2. SSH to the server

```bash
ssh mv-server
```

(If that alias is missing: `ssh administrator@192.168.1.11`)

### 3. Deploy (backup → pull → build → reload)

```bash
sudo deploy-app.sh mv-inventory
# or
sudo deploy-app.sh dos-service-desk
```

What that does:

1. Backs up that app to NAS: `Backups/192.168.1.11/deploy/<timestamp>/`
   - Includes **project files** under `code/` (source, config, public — excludes `node_modules`, `.next`, `.git`)
   - Plus SQLite DBs under `db/`, secrets under `env/`
2. `git pull --ff-only origin <current-branch>`
3. `npm ci` (or `npm install`) + `npm run build` if a `build` script exists
4. `pm2 reload <process-name>`

### 4. Verify

```bash
pm2 status
pm2 logs mv-inventory --lines 50
# or
pm2 logs dos-service-desk --lines 50
```

Check the backup appeared:

- File Station: `Backups → 192.168.1.11 → deploy → <newest folder>`
- Real data for inventory is under `mv-inventory/db/mv-inventory.db` (not the empty-looking app folders without DBs)

---

## Databytes (meal-voting monorepo)

Git lives at `/var/www/databytes` (branch `master`), but PM2 runs backend + frontend separately. Use this flow:

### 1. On your PC

```bash
git push origin master
```

### 2. On the server

```bash
ssh mv-server

# Snapshot both halves first
sudo backup-apps.sh deploy databytes-backend
sudo backup-apps.sh deploy databytes-frontend

cd /var/www/databytes
git pull --ff-only origin master

# Install / build (pnpm workspace)
pnpm install
pnpm --filter ./backend build   # adjust if your scripts differ
pnpm --filter ./frontend build

pm2 reload databytes-api
pm2 reload databytes-web
pm2 status
```

---

## First-time: new app on the server

Example for a Next.js app like checklist (when you are ready):

```bash
ssh mv-server
cd /var/www
git clone https://github.com/YOUR_ORG/mv-checklist.git
cd mv-checklist
cp .env.example .env   # fill secrets on the server only
npm ci
npm run build

# Register for backups + deploy wrapper — add a line to /etc/app-backup.conf:
# mv-checklist|/var/www/mv-checklist|data/mv-checklist.db|public/uploads|mv-checklist

pm2 start npm --name mv-checklist -- start
# or: pm2 start ecosystem.config.cjs
pm2 save
```

Then normal releases use:

```bash
git push origin main          # on PC
sudo deploy-app.sh mv-checklist   # on server
```

---

## Manual backup (no deploy)

```bash
ssh mv-server
sudo backup-apps.sh nightly              # all apps
sudo backup-apps.sh deploy mv-inventory  # one app, deploy folder
```

Nightly cron already runs at **02:15** as root.

---

## If deploy fails

| Symptom | What to check |
|---------|----------------|
| `NAS path is not a mountpoint` | `mountpoint /mnt/nas/backups` — remount / fix credentials |
| `git pull` rejected (not fast-forward) | Someone changed files on the server; inspect `git status` in the app dir |
| PM2 process missing | `pm2 list` — start with `pm2 start …` then `pm2 save` |
| `PM2 process not found` under `sudo deploy-app.sh` | Fixed: script reloads PM2 as the app owner. Or run `pm2 reload <name>` **without** sudo |
| App looks old after deploy | Confirm you pushed the right branch; `git -C /var/www/<app> log -1` |

---

## Quick cheat sheet

```text
PC:     git push origin main
Server: ssh mv-server
        sudo deploy-app.sh mv-inventory
        pm2 logs mv-inventory --lines 50
NAS:    Backups / 192.168.1.11 / deploy / <timestamp> / mv-inventory /
```
