# NAS backups + deploy-time refresh (192.168.1.11)

Backs up apps on the MV server to the Synology NAS (`192.168.1.136`, DSM on `:5000`) on every deploy and every night.

## Layout on the server

| Path | Purpose |
|------|---------|
| `/usr/local/bin/backup-apps.sh` | Nightly / deploy backups |
| `/usr/local/bin/deploy-app.sh` | Backup → git pull → build → pm2 reload |
| `/usr/local/bin/inventory-apps.sh` | Discover app roots / DBs |
| `/usr/local/bin/restore-drill.sh` | Non-destructive restore test |
| `/etc/app-backup.conf` | App registry |
| `/etc/nas-backup.credentials` | CIFS credentials (mode 600) |
| `/mnt/nas/backups` | NAS mount |
| `/var/log/app-backup.log` | Cron log |

NAS destination: `/mnt/nas/backups/192.168.1.11/{nightly,deploy}/<timestamp>/<app>/`

## One-shot install (on the server)

```bash
# as root, from a copy of this folder
export NAS_IP=192.168.1.136
export NAS_SHARE=Backups
export NAS_USER=Databytes
export NAS_PASSWORD='your-nas-password'
sudo -E bash install.sh
```

Or create `nas-credentials` (from the example) next to `install.sh` before running.

### Live install (this environment)

| Item | Value |
|------|--------|
| App server | `192.168.1.11` (`administrator-DB-APPS-PROD-SVR01`) |
| NAS | `192.168.1.136` ([DSM](http://192.168.1.136:5000/)) |
| Share | `Backups` → `/mnt/nas/backups` |
| Apps | `/var/www/mv-inventory`, `/var/www/dos-service-desk`, `/var/www/databytes/{backend,frontend}` |
| Cron | `15 2 * * *` root nightly backup |
| SSH | `ssh mv-server` (key `~/.ssh/id_ed25519_mv_server`) |

## Daily use

```bash
# after git push from your PC:
ssh mv-server 'sudo deploy-app.sh mv-checklist'

# manual backup
sudo backup-apps.sh nightly
sudo backup-apps.sh deploy mv-inventory

# restore drill (safe; uses /tmp)
sudo restore-drill.sh --nightly --app mv-checklist
```

## Retention

- Nightly: 14 days
- Deploy snapshots: last 30

## Observed apps (network probe)

| Port | App |
|------|-----|
| 3000 | Maya Villa Inventory |
| 3002 | DOS Task Board |
| 3004 | MV Checklist |
| 80 | nginx |
