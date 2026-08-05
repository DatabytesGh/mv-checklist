import type Database from "better-sqlite3";
import { usesInventoryUserSchema } from "./users-db";

export function runMigrations(
  db: Database.Database,
  opts: { skipUsers?: boolean } = {},
): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cl_schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role TEXT PRIMARY KEY,
      permissions_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'vendor',
      phone TEXT,
      whatsapp_number TEXT,
      email TEXT,
      specialization TEXT,
      notes TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE,
      is_active INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      institution TEXT,
      guest_count INTEGER,
      conference_type TEXT,
      coordinator_name TEXT,
      coordinator_phone TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'Planning',
      created_by_user_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS checklist_types (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'clipboard',
      department_tag TEXT,
      frequency TEXT NOT NULL DEFAULT 'daily',
      completer_role TEXT NOT NULL,
      approver_role TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS checklist_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checklist_type_slug TEXT NOT NULL,
      section TEXT NOT NULL,
      item_order INTEGER NOT NULL,
      item_text TEXT NOT NULL,
      requires_time_entry INTEGER NOT NULL DEFAULT 0,
      requires_text_entry INTEGER NOT NULL DEFAULT 0,
      is_shift_leader_selector INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (checklist_type_slug) REFERENCES checklist_types(slug)
    );

    CREATE TABLE IF NOT EXISTS checklist_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checklist_type_slug TEXT NOT NULL,
      date TEXT NOT NULL,
      conference_id INTEGER,
      status TEXT NOT NULL DEFAULT 'not_started',
      started_by_user_id TEXT,
      submitted_at TEXT,
      approved_by_user_id TEXT,
      approved_at TEXT,
      rejection_reason TEXT,
      notes TEXT,
      UNIQUE(checklist_type_slug, date, conference_id)
    );

    CREATE TABLE IF NOT EXISTS checklist_item_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      template_item_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      text_value TEXT,
      time_value TEXT,
      checked_by_user_id TEXT,
      checked_at TEXT,
      UNIQUE(session_id, template_item_id),
      FOREIGN KEY (session_id) REFERENCES checklist_sessions(id),
      FOREIGN KEY (template_item_id) REFERENCES checklist_templates(id)
    );

    CREATE TABLE IF NOT EXISTS fault_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      item_response_id INTEGER,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      location TEXT,
      severity TEXT NOT NULL DEFAULT 'medium',
      vendor_id INTEGER,
      status TEXT NOT NULL DEFAULT 'open',
      reported_by_user_id TEXT NOT NULL,
      reported_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_by_user_id TEXT,
      resolved_at TEXT,
      whatsapp_sent INTEGER NOT NULL DEFAULT 0,
      whatsapp_sent_at TEXT,
      resolution_notes TEXT,
      FOREIGN KEY (session_id) REFERENCES checklist_sessions(id)
    );

    CREATE TABLE IF NOT EXISTS fault_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fault_report_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      uploaded_by_user_id TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (fault_report_id) REFERENCES fault_reports(id)
    );

    CREATE TABLE IF NOT EXISTS checklist_item_photos (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      template_item_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      uploaded_by_user_id TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_date ON checklist_sessions(date);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON checklist_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_faults_status ON fault_reports(status);
    CREATE INDEX IF NOT EXISTS idx_item_photos ON checklist_item_photos(session_id, template_item_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_name ON staff(name COLLATE NOCASE);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_session
      ON checklist_sessions(checklist_type_slug, date)
      WHERE conference_id IS NULL;
  `);

  // In shared mode the `users` table lives in the inventory DB and is exposed
  // via a temp view, so skip all local users-table setup here.
  if (opts.skipUsers) {
    const row = db
      .prepare("SELECT version FROM cl_schema_version WHERE id = 1")
      .get() as { version: number } | undefined;
    if (!row) {
      db.prepare("INSERT INTO cl_schema_version (id, version) VALUES (1, 1)").run();
    }
    return;
  }

  const hasUsers = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    .get();
  if (!hasUsers) {
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        display_name TEXT,
        phone TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        checklist_only INTEGER NOT NULL DEFAULT 0,
        inventory_user_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  } else if (!usesInventoryUserSchema(db)) {
    const cols = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    if (!names.has("checklist_only")) {
      db.exec(`ALTER TABLE users ADD COLUMN checklist_only INTEGER NOT NULL DEFAULT 0`);
    }
  }

  // Shared inventory DB: ensure checklist_only column exists
  if (usesInventoryUserSchema(db)) {
    const cols = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    if (!names.has("checklist_only")) {
      db.exec(`ALTER TABLE users ADD COLUMN checklist_only INTEGER NOT NULL DEFAULT 0`);
    }
  }

  // Older DBs created the conferences table with `institution NOT NULL` and
  // `created_at NOT NULL` (no default). Now that the create form no longer asks
  // for an institution, we rebuild the table with the relaxed schema. SQLite
  // can't ALTER a column's NOT NULL, so we do the standard rename-copy-drop.
  const confCols = db.prepare("PRAGMA table_info(conferences)").all() as Array<{
    name: string;
    notnull: number;
    dflt_value: string | null;
  }>;
  if (confCols.length > 0) {
    const institution = confCols.find((c) => c.name === "institution");
    const createdAt = confCols.find((c) => c.name === "created_at");
    const needsRebuild =
      (institution && institution.notnull === 1) ||
      (createdAt && createdAt.notnull === 1 && createdAt.dflt_value == null);
    if (needsRebuild) {
      // Follow SQLite's recommended 12-step rebuild pattern: disable FKs so the
      // rename doesn't cascade-rewrite other tables' FK references. Without
      // this, `ALTER TABLE conferences RENAME` would update
      // `checklist_sessions.conference_id`'s FK target to point to the renamed
      // table, orphaning it once we drop the old table.
      // https://www.sqlite.org/lang_altertable.html#otheralter
      const wasFkOn = db.pragma("foreign_keys", { simple: true }) === 1;
      db.pragma("foreign_keys = OFF");
      try {
        db.exec(`
          BEGIN;
          CREATE TABLE conferences_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            institution TEXT,
            guest_count INTEGER,
            conference_type TEXT,
            coordinator_name TEXT,
            coordinator_phone TEXT,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            notes TEXT,
            status TEXT NOT NULL DEFAULT 'Planning',
            created_by_user_id TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
          INSERT INTO conferences_new (id, name, institution, guest_count, conference_type, coordinator_name, coordinator_phone, start_date, end_date, notes, status, created_by_user_id, created_at)
            SELECT id, name, institution, guest_count, conference_type, coordinator_name, coordinator_phone, start_date, end_date, notes, status, created_by_user_id, COALESCE(created_at, datetime('now'))
            FROM conferences;
          DROP TABLE conferences;
          ALTER TABLE conferences_new RENAME TO conferences;
          COMMIT;
        `);
      } finally {
        if (wasFkOn) db.pragma("foreign_keys = ON");
      }
    }
  }

  // Self-heal: older DBs declared `checklist_types.created_at` as NOT NULL
  // without a default, so inserting a new type (which relies on the default)
  // fails with a NOT NULL constraint error. Rebuild the table when any
  // required column is missing its default or has an outdated NOT NULL shape.
  try {
    const typeCols = db
      .prepare("PRAGMA table_info(checklist_types)")
      .all() as Array<{ name: string; notnull: number; dflt_value: string | null }>;
    if (typeCols.length > 0) {
      const createdAt = typeCols.find((c) => c.name === "created_at");
      const needsRebuild =
        createdAt && createdAt.notnull === 1 && createdAt.dflt_value == null;
      if (needsRebuild) {
        const wasFkOn = db.pragma("foreign_keys", { simple: true }) === 1;
        db.pragma("foreign_keys = OFF");
        try {
          db.exec(`
            BEGIN;
            CREATE TABLE checklist_types_new (
              id TEXT PRIMARY KEY,
              slug TEXT NOT NULL UNIQUE,
              label TEXT NOT NULL,
              icon TEXT NOT NULL DEFAULT 'clipboard',
              department_tag TEXT,
              frequency TEXT NOT NULL DEFAULT 'daily',
              completer_role TEXT NOT NULL,
              approver_role TEXT NOT NULL,
              is_system INTEGER NOT NULL DEFAULT 0,
              is_active INTEGER NOT NULL DEFAULT 1,
              display_order INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO checklist_types_new
              (id, slug, label, icon, department_tag, frequency, completer_role,
               approver_role, is_system, is_active, display_order, created_at)
              SELECT COALESCE(id, lower(hex(randomblob(8)))),
                     slug, label,
                     COALESCE(icon, 'clipboard'),
                     department_tag,
                     COALESCE(frequency, 'daily'),
                     COALESCE(completer_role, 'admin'),
                     COALESCE(approver_role, 'admin'),
                     COALESCE(is_system, 0),
                     COALESCE(is_active, 1),
                     COALESCE(display_order, 0),
                     COALESCE(created_at, datetime('now'))
              FROM checklist_types;
            DROP TABLE checklist_types;
            ALTER TABLE checklist_types_new RENAME TO checklist_types;
            COMMIT;
          `);
        } finally {
          if (wasFkOn) db.pragma("foreign_keys = ON");
        }
      }
    }
  } catch {
    /* table may not exist on very fresh DBs */
  }

  // Self-heal: earlier session inserts wrote JavaScript numbers into a
  // TEXT-typed `conference_id` column, which stored them as "1.0", "2.0"
  // etc. and broke `WHERE conference_id = 2` because SQLite compares
  // stringified-REAL "2.0" != stored "2". Rebuild the column with INTEGER
  // affinity so numeric parameters just work.
  try {
    const cs = db.prepare("PRAGMA table_info(checklist_sessions)").all() as Array<{
      name: string;
      type: string;
    }>;
    const confCol = cs.find((c) => c.name === "conference_id");
    if (confCol && confCol.type.toUpperCase() !== "INTEGER") {
      const wasFkOn = db.pragma("foreign_keys", { simple: true }) === 1;
      db.pragma("foreign_keys = OFF");
      try {
        db.exec(`
          BEGIN;
          CREATE TABLE checklist_sessions_new (
            id TEXT PRIMARY KEY,
            checklist_type_slug TEXT NOT NULL,
            date TEXT NOT NULL,
            conference_id INTEGER,
            status TEXT DEFAULT 'not_started',
            started_by_user_id TEXT NOT NULL,
            submitted_at TEXT,
            approved_by_user_id TEXT,
            approved_at TEXT,
            rejection_reason TEXT,
            notes TEXT,
            UNIQUE(checklist_type_slug, date, conference_id),
            FOREIGN KEY (checklist_type_slug) REFERENCES checklist_types(slug),
            FOREIGN KEY (conference_id) REFERENCES conferences(id)
          );
          INSERT INTO checklist_sessions_new
            SELECT id, checklist_type_slug, date,
                   CASE WHEN conference_id IS NULL THEN NULL
                        ELSE CAST(conference_id AS INTEGER) END,
                   status, started_by_user_id, submitted_at, approved_by_user_id,
                   approved_at, rejection_reason, notes
            FROM checklist_sessions;
          DROP TABLE checklist_sessions;
          ALTER TABLE checklist_sessions_new RENAME TO checklist_sessions;
          COMMIT;
        `);
      } finally {
        if (wasFkOn) db.pragma("foreign_keys = ON");
      }
    }
  } catch {
    /* table missing on very fresh DBs */
  }

  // Orphan conference backfill (zero linked sessions) is handled after seed in
  // db.ts via ensureConferenceChecklistSessions, which also attaches Facility,
  // Kitchen, Bar, Front Desk, and Operational checklists to existing events.

  const row = db
    .prepare("SELECT version FROM cl_schema_version WHERE id = 1")
    .get() as { version: number } | undefined;
  if (!row) {
    db.prepare("INSERT INTO cl_schema_version (id, version) VALUES (1, 1)").run();
  }
}
