# MV Hotel Checklist System — Project Skill Document

## Context
The hotel currently runs paper/WhatsApp-based daily and conference checklists. Staff photograph and share completion status on a WhatsApp group, which makes tracking, approvals, auditing, and fault escalation fragmented and unreliable. This system replaces that workflow with a mobile-first web app where staff complete checklists on their phones, supervisors approve them, faults are reported with photos and escalated to the right vendor via WhatsApp, and management has full reporting and audit trails.

Runs on **port 3003** as a standalone Next.js app in `mv-checklist/` folder, separate from the inventory system on port 3000.

---

## Tech Stack
- **Framework:** Next.js (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS 4, Radix UI primitives
- **Database:** SQLite via `better-sqlite3` — **shared** with inventory system (`../mv-inventory/data/mv-inventory.db`)
  - Users table is shared; both apps read from the same users
  - Inventory users can log into checklist app
  - Checklist app can create checklist-only users (`checklist_only = 1`); these cannot log into inventory
  - All checklist-specific tables (sessions, responses, faults, etc.) added to the same DB
- **WhatsApp:** Meta WhatsApp Cloud API (copy `src/lib/whatsapp.ts` from `mv-inventory`); reuse same env vars
- **State:** Server-side API routes (no global client state)
- **Image Storage:** Local filesystem at `public/uploads/faults/`
- **Port:** 3003 (custom server in `server.mjs`)

---

## 8 Built-in Checklists (Seeded)

| # | Name | Frequency | Items | Who | Approver |
|---|---|---|---|---|---|
| 1 | **Facility / Security** | Daily | 11 (lift, generators, pool, gym, tanks, taps) | Housekeeping | Frontdesk |
| 2 | **Housekeeping End-of-Day** | Daily | 25+ (rooms, corridors, handover, shift leader) | Housekeeping | Frontdesk |
| 3 | **Cyber Bar End-of-Day** | Daily | 15+ (bar, fridge, washroom, shift leader) | Cyber Bar | Frontdesk |
| 4 | **Front Desk End-of-Day** | Daily | 20+ (lights, buildings, keys, social media) | Front Desk | Manager |
| 5 | **Kitchen End-of-Day** | Daily | 22+ (floor, fridge, cylinders, locks) | Kitchen | Frontdesk |
| 6 | **Laundry End-of-Day** | Daily | 20+ (machines, linens, handover, faulty linen) | Housekeeping | Frontdesk |
| 7 | **Pre-Conference** | Per-conference | 25+ (menu, IT, coordinators, menu board) | Frontdesk | Manager |
| 8 | **Conference IT** | Per-conference | 10 (WiFi, projector, screens, printers, IP phones) | IT Staff | Frontdesk |

### Special Fields
- **Shift Leader for Tomorrow**: dropdown (filtered by role), required before submit
- **Time Entry**: for corridor cleans, meal times (e.g., "10:00AM")
- **Text Entry**: for handovers, social media notes, cylinder status, faulty linen notes
- **Fault Capture**: item → mark faulty → open sheet → photo + description + vendor + severity → save fault

---

## RBAC (7 Roles)

| Role | Permissions |
|---|---|
| `admin` | Full access (always true) |
| `frontdesk` | Initiate conferences, approve all, view all, manage users/vendors/settings |
| `housekeeping` | Complete facility, housekeeping, laundry checklists |
| `kitchen` | Complete kitchen checklist |
| `cyberbar` | Complete cyber bar checklist |
| `it_staff` | Complete conference IT checklist |
| `manager` | View all, approve all, full reports (no settings access) |

### 18 Permission Flags (editable per role)
```
completeFacilityChecklist, completeHousekeepingChecklist, completeKitchenChecklist,
completeCyberBarChecklist, completeLaundryChecklist, completePreConferenceChecklist,
completeConferenceITChecklist, completeFrontDeskChecklist,
approveChecklist, initiateConference,
viewDashboard, viewReports, manageVendors, manageUsers, manageSettings,
viewAuditLog, reportFault, resolveFault
```

### Custom Checklist Types
Admin can create new checklist types (e.g., "Car Park", "Gym") in Settings → Checklist Templates:
- Name, icon, department tag
- Own set of items (CRUD)
- Role assignment (who completes), frequency (daily/weekly/event), approver role
- Custom types appear in sidebar and dashboard automatically

---

## Database Schema (10 Tables Added to mv-inventory.db)

### `users` (shared, add column)
```sql
ALTER TABLE users ADD COLUMN checklist_only BOOLEAN DEFAULT 0;
```
> If `checklist_only = 1`, user can't log into inventory system (only checked in checklist app).

### `role_permissions` (shared)
Already exists in inventory; checklist app uses same 18 flags.

### New Tables for Checklist App:

**`vendors`**
```sql
id, name, type, phone, whatsapp_number, email, specialization, notes, is_active, created_at
-- type: vendor|supplier|plumber|electrician|ac_repairer|other
```

**`conferences`**
```sql
id, name, institution, guest_count, conference_type, coordinator_name, coordinator_phone,
start_date, end_date, notes, status, created_by_user_id, created_at
-- status: Planning|Active|Completed|Cancelled
```

**`checklist_types`**
```sql
id, slug, label, icon, department_tag, frequency, completer_role, approver_role,
is_system, is_active, display_order, created_at
-- is_system=1 for built-in 8 types; custom types have is_system=0
```

**`checklist_templates`**
```sql
id, checklist_type_slug, section, item_order, item_text,
requires_time_entry, requires_text_entry, is_shift_leader_selector, is_active
```

**`checklist_sessions`**
```sql
id, checklist_type_slug, date, conference_id, status,
started_by_user_id, submitted_at, approved_by_user_id, approved_at,
rejection_reason, notes
-- status: not_started|in_progress|submitted|approved|rejected
```

**`checklist_item_responses`**
```sql
id, session_id, template_item_id, status, text_value, time_value,
checked_by_user_id, checked_at
-- status: pending|checked|faulty|na
```

**`fault_reports`**
```sql
id, session_id, item_response_id, title, description, location, severity,
vendor_id, status, reported_by_user_id, reported_at, resolved_by_user_id, resolved_at,
whatsapp_sent, whatsapp_sent_at, resolution_notes
-- severity: low|medium|high|critical
-- status: open|reported|in_progress|resolved|closed
```

**`fault_photos`**
```sql
id, fault_report_id, file_path, uploaded_by_user_id, uploaded_at
```

**`audit_logs`**
```sql
id, user_id, action, entity_type, entity_id, details, ip_address, created_at
-- action: login|logout|checklist_started|checklist_submitted|fault_reported|user_created|settings_changed
```

**`settings`**
```sql
key TEXT PRIMARY KEY, value TEXT
-- hotel_name, hotel_whatsapp, approver_whatsapp_{checklist_type}, timezone
```

---

## Pages & Navigation

### Layout / Navigation
- **Mobile**: bottom tab bar (Dashboard, Checklists, Faults, Conferences)
- **Desktop**: left sidebar collapsing to mobile nav on small screens
- Quick-access buttons on dashboard for checklists assigned to user's role

### Pages
```
/                              — Dashboard (checklist cards, conferences, fault summary)
/checklist/[type]/[sessionId]  — Checklist session (items by section, submit)
/conferences                   — Conference list, create/detail page
/faults                        — Fault reports table, detail panel
/reports                       — Charts (completion rate, fault summary, staff perf)
/audit                         — Audit log with filters
/settings/users                — User/role management (admin only)
/settings/vendors              — Vendor CRUD
/settings/templates            — Checklist items editor
/settings/general              — Hotel name, notifications, timezone
```

---

## WhatsApp Integration (2 Manual Flows)

**Reuse `src/lib/whatsapp.ts` from inventory (copy verbatim).**

### Flow 1: Fault → Vendor
1. Staff marks item faulty → Fault Capture Sheet opens
2. Fills: description, location, severity, photos (1-3), **selects vendor** from dropdown
3. Taps "Send via WhatsApp" → calls `sendWhatsAppWithTemplateFallback()`
4. Template: `mmv_fault_report` (params: staff_name, location, item_name, severity, description)
5. Sets `fault_reports.whatsapp_sent = true`, records timestamp

### Flow 2: Checklist Submitted → Approver
1. Staff submits checklist (all items addressed)
2. Submission confirmation screen shows "Notify Approver" button
3. Taps button → calls `sendWhatsAppWithTemplateFallback()` to approver's number
4. Template: `mmv_checklist_submitted` (params: checklist_type, date, staff_name, checked_count, total_count, faulty_count)
5. **Both flows are manual button triggers — never automatic**

### New Templates to Register in Meta Dashboard
- `mmv_fault_report` (body params: staff_name, location, item_name, severity, description)
- `mmv_checklist_submitted` (body params: checklist_type, date, staff_name, checked_count, total_count, faulty_count)

---

## Project Structure
```
mv-checklist/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout, mobile nav
│   │   ├── page.tsx                # Dashboard
│   │   ├── checklist/[type]/[sessionId]/page.tsx
│   │   ├── conferences/page.tsx, [id]/page.tsx
│   │   ├── faults/page.tsx
│   │   ├── reports/page.tsx
│   │   ├── audit/page.tsx
│   │   ├── settings/{users,vendors,templates,general}/page.tsx
│   │   └── api/
│   │       ├── auth/route.ts
│   │       ├── checklists/{route,sessions,items}/
│   │       ├── conferences/route.ts
│   │       ├── faults/route.ts
│   │       ├── vendors/route.ts
│   │       ├── users/route.ts
│   │       ├── reports/route.ts
│   │       └── audit/route.ts
│   ├── lib/
│   │   ├── db.ts                   # SQLite singleton (read ../mv-inventory/data)
│   │   ├── types.ts                # All TS interfaces
│   │   ├── seed.ts                 # Seed 8 checklists + defaults
│   │   ├── auth.ts                 # Cookie/session helpers
│   │   └── whatsapp.ts             # Copy from mv-inventory/src/lib/whatsapp.ts
│   ├── components/
│   │   ├── ui/                     # Radix-based: Button, Card, Badge, Sheet, Modal, Dialog, Table
│   │   ├── layout/MobileNav.tsx, Sidebar.tsx
│   │   ├── checklist/ChecklistItem.tsx, FaultCaptureSheet.tsx, ProgressBar.tsx
│   │   ├── conferences/CreateConferenceModal.tsx
│   │   ├── dashboard/ChecklistStatusCard.tsx
│   │   └── faults/FaultCard.tsx
│   └── providers/auth-provider.tsx
├── public/uploads/faults/
├── data/                           # (shared: ../mv-inventory/data/)
├── server.mjs                      # Custom server (port 3003)
├── next.config.ts
├── package.json
├── tsconfig.json
└── .env.local                      # META_WA_TOKEN, META_WA_PHONE_ID, META_WA_TEMPLATE_LANGS (from inventory)
```

---

## Key Implementation Notes

### Session Auto-Save
Per-item changes saved to localStorage immediately → on submit, batch upload to DB.

### Shift Leader Selector
Items flagged `is_shift_leader_selector: true` render as a user dropdown (filtered by role), not text input.

### Fault Photos
- Capture via `<input type="file" capture="environment">` on mobile
- Save to `public/uploads/faults/[sessionId]/[timestamp].jpg`
- Multiple photos per fault (1-3)

### Conference Workflow
1. Frontdesk creates conference
2. Pre-Conference + IT Checklist auto-attached
3. Housekeeping/IT staff complete checklists
4. All must be approved before conference status → Active

### Approval Flow
- Staff submit → status: submitted (🟠 on dashboard)
- Frontdesk/Manager review → approve (✅) or reject (❌)
- Reject requires reason; staff notified (optional WhatsApp)

### Audit Logging
Every action logged (login, checklist start/submit/approve/reject, fault report/resolve, user/vendor/settings changes).

---

## Development Checklist

- [ ] Create `mv-checklist/` folder with Next.js scaffold
- [ ] Copy `whatsapp.ts` from `mv-inventory/src/lib/`
- [ ] Create database schema + migration script
- [ ] Seed 8 checklists + default vendors
- [ ] Auth routes (login, logout, session)
- [ ] Dashboard page + API
- [ ] Checklist session page + API
- [ ] Fault capture sheet + API
- [ ] Conference management (create, detail)
- [ ] Reports page (completion rate, fault summary, perf)
- [ ] Audit log page
- [ ] Settings pages (users, vendors, templates, general)
- [ ] Mobile nav + responsive layout
- [ ] Test on port 3003 (dev + build)
- [ ] Verify shared DB login with inventory users

---

## Testing Checklist

1. **Auth**: Login as inventory user → checklist app; login as checklist-only user → checklist only (not inventory)
2. **Dashboard**: Verify role-based checklist cards visible
3. **Session**: Complete housekeeping checklist → save per item → submit
4. **Fault**: Mark faulty → photo → vendor → send WhatsApp button works
5. **Approval**: As frontdesk, approve submitted checklist → dashboard updates
6. **Conference**: Create conference → Pre-Conf + IT checklists appear → complete & approve
7. **Reports**: Chart shows today's completion data
8. **Audit**: All actions above logged with timestamp & user
9. **Port 3003**: Build & start server independently of inventory (port 3000)

---

## Notes
- Responsive design: mobile-first, 44px+ tap targets, outdoor-optimized contrast
- Offline resilience: localStorage saves per item, submits when online
- Custom checklists: admin creates anytime in Settings → fully functional immediately
