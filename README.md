# Maya Villa Checklists

Mobile-first hotel checklist system for daily operations and conferences. Dev on **port 3003**, production on **port 3004** (inventory is port 3000).

## Features

- 8 built-in checklists (facility, housekeeping, cyber bar, front desk, kitchen, laundry, pre-conference, conference IT)
- Role-based access (7 roles, 18 permission flags)
- Checklist completion with time/text fields and shift leader selector
- Fault reporting with photos and manual WhatsApp to vendors
- Conference workflow with linked checklists
- Approval flow (submit → approve/reject)
- Audit log, reports, vendor and user management

## Quick start

```bash
cd mv-checklist
npm install
npm run dev
```

Open http://localhost:3003

### Demo logins

| Username | Password | Role |
|----------|----------|------|
| admin | admin | Admin |
| frontdesk | frontdesk | Front Desk |
| housekeeping | housekeeping | Housekeeping |
| kitchen | kitchen | Kitchen |
| cyberbar | cyberbar | Cyber Bar |
| it | it | IT Staff |
| manager | manager | Manager |

Inventory users are synced automatically when the shared database is found at:

`../MV Operating System/mv-inventory/data/mv-inventory.db`

Set `MV_DB_PATH` in `.env.local` to override.

## Production

```bash
npm run build
npm start
```

HTTPS on **port 3004** (self-signed cert, same pattern as inventory). Override with `PORT` if needed.

## WhatsApp

Uses the **Meta WhatsApp Cloud API** (same as inventory).

1. Create `mv-checklist/.env.local` (see `.env.example`) and copy from `mv-inventory/.env.local`:
   - `META_WA_TOKEN`
   - `META_WA_PHONE_ID`
   - `META_WA_TEMPLATE_LANGS` (optional, default `en_US,en_GB,en`)
2. **Restart** the dev server or `npm start` after changing env vars.
3. In the app (admin): **Settings → General** — status banner shows if Meta is configured; use **Send test** with your number (digits only, e.g. `233555271279`).
4. Set **Approver WhatsApp** per checklist type (for “Notify approver” on submit).
5. For faults: add **WhatsApp number** on vendors (**Settings → Vendors**), then **Send WhatsApp** on a fault.

Templates (must exist in Meta Business Manager):

- `mmv_fault_report`
- `mmv_checklist_submitted`

**Check without sending:** `GET /api/whatsapp/status` (logged in as admin).

**Send a test message:** `GET /api/whatsapp/test?to=233XXXXXXXXX` (admin only).

Both checklist and fault sends are **manual button triggers** only. Free-form text works inside Meta’s 24-hour window; otherwise approved templates are used automatically.

## Shared database

Checklist tables are added to the same SQLite file as inventory (`mv-inventory.db`). Inventory login credentials work here; checklist-only users (`checklist_only = 1`) are blocked from inventory by design (enforced in inventory app when implemented).
