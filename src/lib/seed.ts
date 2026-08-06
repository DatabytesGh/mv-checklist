import type Database from "better-sqlite3";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_KEYS } from "./permissions";
import type { ChecklistPermissions, ChecklistRole } from "./types";
import { usesInventoryUserSchema, isUsersShared } from "./users-db";
import { hashPassword } from "./password";
import { insertUser } from "./user-queries";

const FRONTDESK_WHATSAPP_DEFAULT = "0543843090";

type TemplateItem = {
  section: string;
  text: string;
  time?: boolean;
  textEntry?: boolean;
  shiftLeader?: boolean;
};

const CHECKLIST_TYPES: Array<{
  slug: string;
  label: string;
  icon: string;
  department: string;
  frequency: string;
  completer: ChecklistRole;
  approver: ChecklistRole;
  order: number;
  items: TemplateItem[];
}> = [
  {
    slug: "facility",
    label: "Facility / Security",
    icon: "shield",
    department: "Facilities",
    frequency: "daily",
    completer: "housekeeping",
    approver: "frontdesk",
    order: 1,
    items: [
      { section: "Daily Checks", text: "Lift inspected and functioning" },
      { section: "Daily Checks", text: "Generators tested and fuel level checked" },
      { section: "Daily Checks", text: "Generator switch-over tested" },
      { section: "Daily Checks", text: "Swimming pool area secure and equipment stored" },
      { section: "Daily Checks", text: "Gym equipment tidy and lights off" },
      { section: "Daily Checks", text: "Water tanks and levels checked" },
      { section: "Daily Checks", text: "External taps closed — no dripping" },
      { section: "Daily Checks", text: "Tank area tidy — report any concerns", textEntry: true },
      { section: "Daily Checks", text: "External doors and gates secured" },
      { section: "Daily Checks", text: "CCTV and security handover noted", textEntry: true },
      { section: "Handover", text: "Shift leader for tomorrow", shiftLeader: true },
    ],
  },
  {
    slug: "housekeeping",
    label: "Housekeeping End-of-Day",
    icon: "bed",
    department: "Housekeeping",
    frequency: "daily",
    completer: "housekeeping",
    approver: "frontdesk",
    order: 2,
    items: [
      { section: "Guest Rooms", text: "All guest room doors and windows closed" },
      { section: "Guest Rooms", text: "Guest room bathroom windows closed" },
      { section: "Guest Rooms", text: "All window blinds in rooms pulled down" },
      { section: "Guest Rooms", text: "All ACs, lights, and plugs in rooms turned OFF" },
      { section: "Guest Rooms", text: "Sink taps in rooms closed — no dripping" },
      { section: "Guest Rooms", text: "Shower taps closed properly in rooms" },
      { section: "Guest Rooms", text: "Toilet water tanks not running in rooms and staff washroom" },
      { section: "Guest Rooms", text: "Room kitchenette tap closed properly" },
      { section: "Guest Rooms", text: "Kitchenette cabinet empty, dusted, opened for ventilation" },
      { section: "Guest Rooms", text: "Microwave cleaned and left open when room not occupied" },
      { section: "Guest Rooms", text: "Fridge cleaned after guest use — door ajar for ventilation" },
      { section: "Storage", text: "Mops drying reported and buckets cleaned (state count)", textEntry: true },
      { section: "Storage", text: "Housekeeping storage room tidied" },
      { section: "External", text: "Front of reception area — stairs and slope tidied" },
      {
        section: "External",
        text: "Hotel suite corridors and staircases A and B dusted min. 3×/day (state times)",
        time: true,
        textEntry: true,
      },
      { section: "External", text: "Corridor 1 Executive Suite cleaned", time: true },
      { section: "External", text: "Corridor 2 upstairs Family suite cleaned", time: true },
      { section: "External", text: "Corridor 3 downstairs Deluxe suite cleaned", time: true },
      { section: "External", text: "Corridors and suites cobweb free" },
      { section: "External", text: "External washroom monitored — report concerns", textEntry: true },
      { section: "External", text: "Cyber bar washroom doors locked when not in guest mode" },
      { section: "External", text: "Housekeeping bin emptied to bin house — report if full", textEntry: true },
      { section: "External", text: "Tank area tidy — report concerns", textEntry: true },
      { section: "Handover", text: "Master card returned (who to whom)", textEntry: true },
      { section: "Handover", text: "Shift handover notes", textEntry: true },
      { section: "Handover", text: "Shift leader for tomorrow", shiftLeader: true },
    ],
  },
  {
    slug: "cyberbar",
    label: "Cyber Bar End-of-Day",
    icon: "coffee",
    department: "Cyber Bar",
    frequency: "daily",
    completer: "cyberbar",
    approver: "frontdesk",
    order: 3,
    items: [
      { section: "Bar Area", text: "Bar floor mopped and clutter free" },
      { section: "Bar Area", text: "Fridge drinks orderly arranged" },
      { section: "Bar Area", text: "Bar counter clean and clutter free" },
      { section: "Bar Area", text: "Bar shelves orderly arranged and clean" },
      { section: "Bar Area", text: "Bar high chairs cleaned and functioning" },
      { section: "Bar Area", text: "Bar pillars dust free" },
      { section: "Bar Area", text: "Ornaments, flowers, and stands in place" },
      { section: "Bar Area", text: "Windows closed and functioning" },
      { section: "Bar Area", text: "Tables and chairs in good shape" },
      { section: "Bar Area", text: "Drink barrel decor corners neat — items accounted" },
      { section: "Bar Area", text: "Insect killer dust/insect free and turned off" },
      { section: "Bar Area", text: "Bins empty" },
      { section: "Bar Area", text: "Unused plug sockets turned off" },
      { section: "Restaurant", text: "BBQ area clean, dusted, and mopped" },
      { section: "Restaurant", text: "Restaurant washroom clean and mopped" },
      { section: "Handover", text: "On-shift staff (STS) noted", textEntry: true },
      { section: "Handover", text: "Shift leader for tomorrow", shiftLeader: true },
    ],
  },
  {
    slug: "frontdesk",
    label: "Front Desk End-of-Day",
    icon: "building",
    department: "Front Desk",
    frequency: "daily",
    completer: "frontdesk",
    approver: "manager",
    order: 4,
    items: [
      { section: "Exterior & Buildings", text: "All external lights on" },
      { section: "Exterior & Buildings", text: "Conference room windows closed" },
      { section: "Exterior & Buildings", text: "Conference washroom closed — tanks/taps not dripping" },
      { section: "Exterior & Buildings", text: "Maya's boardroom windows closed" },
      { section: "Exterior & Buildings", text: "Emergency exit doors at event building locked" },
      { section: "Exterior & Buildings", text: "Front office blinds drawn except desk blind" },
      { section: "Exterior & Buildings", text: "Internal lights and TV screens off" },
      { section: "Exterior & Buildings", text: "Front desk staff logged off drive and laptop" },
      { section: "Exterior & Buildings", text: "Family and Deluxe facility room windows/doors closed" },
      { section: "Exterior & Buildings", text: "Executive Suite lobby sliding windows closed" },
      { section: "Power Room", text: "Power room temperature checked" },
      { section: "Power Room", text: "Power room AC off, fan on, window open" },
      { section: "Power Room", text: "Aseidua's corner light on (off by 10pm)" },
      { section: "Power Room", text: "External washroom checked regularly" },
      { section: "Power Room", text: "Event building and Executive Suite locked" },
      { section: "Departments", text: "Kitchen tidy, locked, keys at front desk" },
      { section: "Departments", text: "Storekeeping tidy, lights off, keys handed over" },
      { section: "Departments", text: "Departmental requisition sheets shared" },
      { section: "Departments", text: "Cyber Bar tidy, checklist shared, door locked" },
      { section: "Departments", text: "Cyber washroom locked — keys at front desk" },
      { section: "Departments", text: "Laundry tidy, locked, keys returned" },
      { section: "Departments", text: "Housekeeping checklist shared, keys returned" },
      { section: "Operations", text: "Front desk next-day plan shared on operations page" },
      { section: "Operations", text: "Shift leader for tomorrow", shiftLeader: true },
      { section: "Operations", text: "All MV staff left except night security" },
      { section: "Social Media", text: "Amazon work email", textEntry: true },
      { section: "Social Media", text: "Expedia bookings", textEntry: true },
      { section: "Social Media", text: "Live Chat messages", textEntry: true },
      { section: "Social Media", text: "Booking.com status", textEntry: true },
      { section: "Social Media", text: "Instagram and Facebook", textEntry: true },
      { section: "Social Media", text: "WhatsApp enquiries", textEntry: true },
      { section: "Social Media", text: "Phone calls log", textEntry: true },
    ],
  },
  {
    slug: "kitchen",
    label: "Kitchen End-of-Day",
    icon: "chef-hat",
    department: "Kitchen",
    frequency: "daily",
    completer: "kitchen",
    approver: "frontdesk",
    order: 5,
    items: [
      { section: "Cleaning", text: "Kitchen floor mopped — mop returned to storage" },
      { section: "Cleaning", text: "All cookware washed and stored" },
      { section: "Cleaning", text: "Burners cleaned and sink wiped dry" },
      { section: "Cleaning", text: "Oven outside clean — no cookware on top" },
      { section: "Cleaning", text: "Cookware used outside returned to storage" },
      { section: "Cleaning", text: "Counter worktop tidied" },
      { section: "Cleaning", text: "Top of kitchen cabinets clutter free" },
      { section: "Cleaning", text: "Writing table area tidied" },
      { section: "Refrigeration", text: "Fridges/freezers cleaned and organized" },
      { section: "Refrigeration", text: "Opened bottled sauces in designated fridge" },
      { section: "Refrigeration", text: "Store room door open, fan on" },
      { section: "Refrigeration", text: "Food items recorded on request sheet" },
      { section: "Equipment", text: "Insect killing device working" },
      { section: "Equipment", text: "Insect device cleaned and turned off" },
      { section: "Equipment", text: "Tiled wall behind kitchen cleaned" },
      { section: "Equipment", text: "Heat extractor cleaned" },
      { section: "Gas Cylinders", text: "Cylinder status (B1, B2, S1, S2)", textEntry: true },
      { section: "Gas Cylinders", text: "Gas cylinders inspected and cleaned" },
      { section: "Closing", text: "Bin washed, rubbish to bin house, mops dried" },
      { section: "Closing", text: "Kitchen window closed, doors locked, keys to front desk" },
      { section: "Handover", text: "Shift start/end notes", textEntry: true },
      { section: "Handover", text: "Shift leader for tomorrow", shiftLeader: true },
    ],
  },
  {
    slug: "laundry",
    label: "Laundry End-of-Day",
    icon: "shirt",
    department: "Housekeeping",
    frequency: "daily",
    completer: "housekeeping",
    approver: "frontdesk",
    order: 6,
    items: [
      { section: "Room", text: "Floor/window sill cleaned including under ironing table" },
      { section: "Room", text: "Floor mopped daily; external door wiped twice weekly" },
      { section: "Linen", text: "Unwashed items in checkered bags under ironing table" },
      { section: "Linen", text: "Washed linens folded in designated cabinet" },
      { section: "Linen", text: "Only clean staff clothes on hangers — not overloaded" },
      { section: "Linen", text: "Linen cabinets organized, labelled, locked" },
      { section: "Equipment", text: "Washing machine deep cleaned (state day)", textEntry: true },
      { section: "Equipment", text: "11 clear storage containers intact and damp free" },
      { section: "Equipment", text: "Containers opened for ventilation, covered end of shift" },
      { section: "Equipment", text: "Unused machine top dust and clutter free" },
      { section: "Equipment", text: "Washing machine and iron plugs removed" },
      { section: "Supplies", text: "Detergents in labelled containers" },
      { section: "Supplies", text: "Pegs in storage bowl" },
      { section: "Supplies", text: "Detergents and water gallon stored and locked" },
      { section: "Closing", text: "Bin emptied and cleaned" },
      { section: "Closing", text: "Room brush and dustpan stored" },
      { section: "Closing", text: "Faulty linen cabinet update", textEntry: true },
      { section: "Handover", text: "Handover to whom — room state photo shared", textEntry: true },
      { section: "Handover", text: "Laundry record book photo shared", textEntry: true },
      { section: "Handover", text: "Staff lockers locked, keys at front desk" },
      { section: "Handover", text: "Inspected by (name)", textEntry: true },
      { section: "Handover", text: "Shift leader for tomorrow", shiftLeader: true },
    ],
  },
  {
    slug: "operational",
    label: "Operational Checklist",
    icon: "clipboard",
    department: "Operations",
    frequency: "event",
    completer: "frontdesk",
    approver: "manager",
    order: 0,
    items: [
      {
        section: "Briefing",
        text: "Department heads briefed on conference schedule",
        textEntry: true,
      },
      {
        section: "Briefing",
        text: "Emergency contacts list available at front desk",
      },
      {
        section: "Venue",
        text: "Conference venue walkthrough completed",
      },
      {
        section: "Venue",
        text: "Signage and wayfinding in place",
      },
      {
        section: "Venue",
        text: "Registration / check-in area set",
      },
      {
        section: "Venue",
        text: "Breakout areas prepared if required",
      },
      {
        section: "Hospitality",
        text: "Water stations / hospitality ready",
      },
      {
        section: "Arrival",
        text: "Parking and arrival instructions confirmed",
        textEntry: true,
      },
      {
        section: "Coordination",
        text: "Facility, kitchen, bar, and front desk conference checklists assigned",
      },
      {
        section: "Closing",
        text: "End-of-day conference areas secured",
      },
    ],
  },
  {
    slug: "pre-conference",
    label: "Pre-Conference",
    icon: "calendar",
    department: "Front Desk",
    frequency: "event",
    completer: "frontdesk",
    approver: "manager",
    order: 7,
    items: [
      { section: "Planning", text: "Type of package chosen by group", textEntry: true },
      { section: "Planning", text: "Number of pax", textEntry: true },
      { section: "Planning", text: "Date and duration of conference", textEntry: true },
      { section: "Guest Services", text: "Enough stationeries for guest use" },
      { section: "Guest Services", text: "Guest coupons prepared if needed" },
      { section: "Guest Services", text: "Meal coupons prepared and handed to coordinator" },
      { section: "Facilities", text: "Spillover facility ready if required" },
      { section: "Facilities", text: "Transportation for spillover team if applicable" },
      { section: "Staff", text: "Temporary waiters trained, badges printed, on standby" },
      { section: "Conference Room", text: "Room set-up confirmed with coordinator" },
      { section: "Conference Room", text: "Check-in and check-out times communicated" },
      { section: "IT & AV", text: "Internet, TV, microphone, projector, marketing screen tested" },
      { section: "Marketing", text: "Welcome note and promos at reception and corridor TVs" },
      { section: "IT & AV", text: "Internet vouchers ready" },
      {
        section: "IT & AV",
        text: "Usable buildings DSTV renewed (confirm with IT)",
      },
      { section: "Front Desk", text: "Front desk contact on key card labels" },
      {
        section: "Front Desk",
        text: "Front desk liaison rep chosen for each meal time",
        textEntry: true,
      },
      { section: "Facilities", text: "Generators tested and switch-over smooth" },
      { section: "Facilities", text: "Spare fuel for gen sets available" },
      { section: "Facilities", text: "Lift working (confirm with Facilities)" },
      { section: "Kitchen", text: "Chafing fuel and cling film sufficient" },
      { section: "Kitchen", text: "Conference menu planned and sent to client" },
      { section: "Kitchen", text: "Fresh juice/local drink/coconut water arranged" },
      { section: "Kitchen", text: "Menu board updated — today and tomorrow meals" },
      { section: "Kitchen", text: "Individual menu stands written" },
      { section: "Vendors", text: "Plumber, electrician, AC repairer notified" },
      { section: "Departments", text: "All departments notified of upcoming event" },
      {
        section: "Guest Services",
        text: "Rooms 205, 305, 405, and 505 used last for guests",
      },
      { section: "Staff", text: "Toilet manning rota planned" },
    ],
  },
  {
    slug: "conference-it",
    label: "Conference IT",
    icon: "wifi",
    department: "IT",
    frequency: "event",
    completer: "it_staff",
    approver: "frontdesk",
    order: 8,
    items: [
      { section: "Network", text: "WiFi vouchers ready" },
      { section: "AV", text: "Projector installation tested" },
      { section: "AV", text: "Speakers tested" },
      { section: "AV", text: "Wireless microphones tested" },
      { section: "AV", text: "Batteries replaced or fully charged" },
      { section: "AV", text: "Cables (HDMI, VGA, audio) available" },
      { section: "Displays", text: "Display screens (front desk, hallway, lift) working" },
      { section: "Displays", text: "Bedroom TV personalized welcome note" },
      { section: "Displays", text: "IPTV working in room TVs (Plex)" },
      { section: "Displays", text: "DSTV working" },
      { section: "Hardware", text: "Front desk printer — toner and paper" },
      { section: "Hardware", text: "Conference menu designed and shared" },
      { section: "Access", text: "Room door locks — key cards and batteries" },
      { section: "Hardware", text: "IP phones in guest rooms working" },
    ],
  },
];

const DEFAULT_VENDORS = [
  { name: "Nicholas", type: "plumber", specialization: "Plumbing" },
  { name: "Electrician On-Call", type: "electrician", specialization: "Electrical" },
  { name: "AC Repair", type: "ac_repairer", specialization: "Air conditioning" },
  { name: "General Maintenance", type: "vendor", specialization: "General repairs" },
];

function mapInventoryRole(role: string): ChecklistRole {
  const m: Record<string, ChecklistRole> = {
    admin: "admin",
    manager: "manager",
    frontdesk: "frontdesk",
    kitchen: "kitchen",
    inventory_manager: "manager",
    accountant: "manager",
  };
  return m[role] ?? "frontdesk";
}

export function syncInventoryUsers(db: Database.Database): void {
  // Shared inventory DB already has a relational users table (password_hash).
  if (usesInventoryUserSchema(db)) return;

  try {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_state'")
      .get();
    if (!row) return;

    const stateRow = db
      .prepare("SELECT data FROM app_state WHERE id = 1")
      .get() as { data: string } | undefined;
    if (!stateRow) return;

    const state = JSON.parse(stateRow.data) as {
      users: Array<{
        id: string;
        username: string;
        password: string;
        role: string;
        active: boolean;
        phone?: string;
      }>;
    };

    const upsert = db.prepare(`
      INSERT INTO users (id, username, password, role, display_name, phone, active, checklist_only, inventory_user_id)
      VALUES (@id, @username, @password, @role, @display_name, @phone, @active, 0, @inventory_user_id)
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        password = excluded.password,
        role = excluded.role,
        phone = excluded.phone,
        active = excluded.active,
        inventory_user_id = excluded.inventory_user_id
      WHERE checklist_only = 0
    `);

    for (const u of state.users) {
      upsert.run({
        id: `inv-${u.id}`,
        username: u.username,
        password: u.password,
        role: mapInventoryRole(u.role),
        display_name: u.username,
        phone: u.phone ?? null,
        active: u.active ? 1 : 0,
        inventory_user_id: u.id,
      });
    }
  } catch {
    /* ignore */
  }
}

export function seedRolePermissions(db: Database.Database): void {
  for (const [role, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    db.prepare(
      `INSERT OR IGNORE INTO role_permissions (role, permissions_json) VALUES (?, ?)`,
    ).run(role, JSON.stringify(perms));
  }
  // Merge newly added permission keys into existing role rows without
  // overwriting admin-customized flags that already exist.
  const rows = db
    .prepare(`SELECT role, permissions_json FROM role_permissions`)
    .all() as Array<{ role: string; permissions_json: string }>;
  const update = db.prepare(
    `UPDATE role_permissions SET permissions_json = ? WHERE role = ?`,
  );
  for (const row of rows) {
    const defaults =
      DEFAULT_ROLE_PERMISSIONS[row.role as ChecklistRole] ??
      DEFAULT_ROLE_PERMISSIONS.frontdesk;
    let stored: Record<string, boolean> = {};
    try {
      stored = JSON.parse(row.permissions_json) as Record<string, boolean>;
    } catch {
      stored = {};
    }
    let changed = false;
    const merged: Record<string, boolean> = { ...stored };
    for (const key of PERMISSION_KEYS) {
      if (merged[key] === undefined) {
        merged[key] = defaults[key];
        changed = true;
      }
    }
    if (changed) update.run(JSON.stringify(merged), row.role);
  }
}

export function seedDemoUsers(db: Database.Database): void {
  // Never create demo accounts in the shared inventory users table.
  if (isUsersShared(db)) return;

  const demoUsers = [
    { id: "user-fd", username: "frontdesk", password: "frontdesk", role: "frontdesk", name: "Front Desk" },
    { id: "user-hk", username: "housekeeping", password: "housekeeping", role: "housekeeping", name: "Housekeeping" },
    { id: "user-kitchen", username: "kitchen", password: "kitchen", role: "kitchen", name: "Kitchen" },
    { id: "user-bar", username: "cyberbar", password: "cyberbar", role: "cyberbar", name: "Cyber Bar" },
    { id: "user-it", username: "it", password: "it", role: "it_staff", name: "IT Staff" },
    { id: "user-mgr", username: "manager", password: "manager", role: "manager", name: "Manager" },
  ];

  for (const u of demoUsers) {
    const exists = db
      .prepare("SELECT id FROM users WHERE username = ?")
      .get(u.username);
    if (exists) continue;

    if (usesInventoryUserSchema(db)) {
      db.prepare(
        `INSERT INTO users (id, username, password_hash, full_name, role, is_active, checklist_only, created_at)
         VALUES (?, ?, ?, ?, ?, 1, 1, datetime('now'))`,
      ).run(u.id, u.username, hashPassword(u.password), u.name, u.role);
    } else {
      db.prepare(
        `INSERT INTO users (id, username, password, role, display_name, phone, active, checklist_only)
         VALUES (?, ?, ?, ?, ?, ?, 1, 1)`,
      ).run(
        u.id,
        u.username,
        u.password,
        u.role,
        u.name,
        u.role === "frontdesk" ? FRONTDESK_WHATSAPP_DEFAULT : null,
      );
    }
  }

  // Keep Front Desk phone filled so RBAC WhatsApp has a recipient.
  if (!usesInventoryUserSchema(db)) {
    db.prepare(
      `UPDATE users SET phone = ?
       WHERE role = 'frontdesk'
         AND active = 1
         AND trim(COALESCE(phone, '')) = ''`,
    ).run(FRONTDESK_WHATSAPP_DEFAULT);
  }
}

/**
 * Insert any CHECKLIST_TYPES rows (types + templates) missing from an
 * already-seeded DB. Does not update or delete admin-edited items.
 */
export function syncMissingTemplateItems(db: Database.Database): void {
  const typeExists = db.prepare(
    `SELECT 1 AS ok FROM checklist_types WHERE slug = ?`,
  );
  const insertType = db.prepare(
    `INSERT INTO checklist_types
       (id, slug, label, icon, department_tag, frequency, completer_role, approver_role, is_system, display_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'))`,
  );
  const itemExists = db.prepare(
    `SELECT 1 AS ok FROM checklist_templates
     WHERE checklist_type_slug = ? AND item_text = ?`,
  );
  const maxOrderStmt = db.prepare(
    `SELECT COALESCE(MAX(item_order), 0) AS m
     FROM checklist_templates WHERE checklist_type_slug = ?`,
  );
  const insertItem = db.prepare(
    `INSERT INTO checklist_templates
       (checklist_type_slug, section, item_order, item_text,
        requires_time_entry, requires_text_entry, is_shift_leader_selector)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const run = db.transaction(() => {
    for (const ct of CHECKLIST_TYPES) {
      if (!typeExists.get(ct.slug)) {
        insertType.run(
          `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          ct.slug,
          ct.label,
          ct.icon,
          ct.department,
          ct.frequency,
          ct.completer,
          ct.approver,
          ct.order,
        );
      }
      for (const item of ct.items) {
        if (itemExists.get(ct.slug, item.text)) continue;
        const nextOrder =
          ((maxOrderStmt.get(ct.slug) as { m: number }).m ?? 0) + 1;
        insertItem.run(
          ct.slug,
          item.section,
          nextOrder,
          item.text,
          item.time ? 1 : 0,
          item.textEntry ? 1 : 0,
          item.shiftLeader ? 1 : 0,
        );
      }
    }
  });
  run();
}

export function seedIfEmpty(db: Database.Database): void {
  const typeCount = (
    db.prepare("SELECT COUNT(*) as c FROM checklist_types").get() as { c: number }
  ).c;
  seedRolePermissions(db);
  seedDemoUsers(db);

  if (typeCount === 0) {
    const adminExists = db
      .prepare("SELECT id FROM users WHERE username = 'admin'")
      .get();
    if (!adminExists) {
      insertUser(db, {
        id: "user-admin",
        username: "admin",
        password: "admin",
        role: "admin",
        display_name: "Administrator",
        checklist_only: false,
      });
    }

    for (const ct of CHECKLIST_TYPES) {
      db.prepare(
        `INSERT INTO checklist_types (id, slug, label, icon, department_tag, frequency, completer_role, approver_role, is_system, display_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'))`,
      ).run(
        `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        ct.slug,
        ct.label,
        ct.icon,
        ct.department,
        ct.frequency,
        ct.completer,
        ct.approver,
        ct.order,
      );

      let order = 0;
      for (const item of ct.items) {
        order += 1;
        db.prepare(
          `INSERT INTO checklist_templates (checklist_type_slug, section, item_order, item_text, requires_time_entry, requires_text_entry, is_shift_leader_selector)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          ct.slug,
          item.section,
          order,
          item.text,
          item.time ? 1 : 0,
          item.textEntry ? 1 : 0,
          item.shiftLeader ? 1 : 0,
        );
      }
    }

    for (const v of DEFAULT_VENDORS) {
      db.prepare(
        `INSERT INTO vendors (name, type, specialization, is_active) VALUES (?, ?, ?, 1)`,
      ).run(v.name, v.type, v.specialization);
    }

    const settings: Record<string, string> = {
      hotel_name: "Maya Villa Hotel",
      hotel_whatsapp: FRONTDESK_WHATSAPP_DEFAULT,
      timezone: "Africa/Accra",
    };
    for (const [k, val] of Object.entries(settings)) {
      db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`).run(
        k,
        val,
      );
    }
  }

  // Always run: picks up newly added seed items on existing installs.
  syncMissingTemplateItems(db);
}

export function getRolePermissions(
  db: Database.Database,
  role: ChecklistRole,
) {
  const defaults = DEFAULT_ROLE_PERMISSIONS[role] ?? DEFAULT_ROLE_PERMISSIONS.frontdesk;
  const row = db
    .prepare("SELECT permissions_json FROM role_permissions WHERE role = ?")
    .get(role) as { permissions_json: string } | undefined;
  if (!row) return { ...defaults };
  try {
    const stored = JSON.parse(row.permissions_json) as Partial<ChecklistPermissions>;
    return { ...defaults, ...stored };
  } catch {
    return { ...defaults };
  }
}

export function saveRolePermissions(
  db: Database.Database,
  role: ChecklistRole,
  perms: Record<string, boolean>,
) {
  const filtered = Object.fromEntries(
    PERMISSION_KEYS.map((k) => [k, !!perms[k]]),
  );
  db.prepare(
    `INSERT INTO role_permissions (role, permissions_json) VALUES (?, ?)
     ON CONFLICT(role) DO UPDATE SET permissions_json = excluded.permissions_json`,
  ).run(role, JSON.stringify(filtered));
}
