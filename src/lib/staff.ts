import type Database from "better-sqlite3";

/** Default hotel staff directory for shift-leader pickers. */
export const DEFAULT_STAFF_NAMES = [
  "Susana Nyarko",
  "Eva Konadu",
  "Nancy Inkoom",
  "Emmanuel Addie",
  "Joseph Omersu",
  "Daniel Asamoah",
  "Michael Mensah",
  "Michael Agyare",
  "Hawa Alhassan",
  "Kingsley Armah",
  "Ebenezer Annan-Mettle",
  "Mabel Agyabeng",
  "Pearl Dogoe",
  "Dora Asare",
  "Eunice Kattah",
  "Priscilla Amegatse",
  "Nelson Klovi",
  "Belinda Agbalenyo",
  "Ebenezer Teye Ayertey",
  "Benedicta Zottor",
  "Cornelius Ayemu",
  "Buckman Kofi Kumi",
  "Francis Agbesi",
  "Zakaria Abubakari",
  "Emmanuel Addae",
  "Sarkodie Daniel",
  "Gariba Rufai",
  "Daniel Tedeku",
  "Ibrahim Mohammed",
] as const;

export function ensureStaffTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE,
      is_active INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_name ON staff(name COLLATE NOCASE);
  `);
}

/** Insert default names that are not already present (idempotent). */
export function seedStaffDirectory(db: Database.Database): void {
  ensureStaffTable(db);
  const insert = db.prepare(
    `INSERT OR IGNORE INTO staff (name, is_active, display_order)
     VALUES (?, 1, ?)`,
  );
  const tx = db.transaction(() => {
    DEFAULT_STAFF_NAMES.forEach((name, index) => {
      insert.run(name, index + 1);
    });
  });
  tx();
}

export type StaffRow = {
  id: number;
  name: string;
  is_active: number;
  display_order: number;
  created_at: string;
};

export function listStaff(
  db: Database.Database,
  opts: { includeInactive?: boolean } = {},
): StaffRow[] {
  ensureStaffTable(db);
  if (opts.includeInactive) {
    return db
      .prepare(
        `SELECT * FROM staff
         ORDER BY is_active DESC, display_order ASC, name COLLATE NOCASE ASC`,
      )
      .all() as StaffRow[];
  }
  return db
    .prepare(
      `SELECT * FROM staff
       WHERE is_active = 1
       ORDER BY display_order ASC, name COLLATE NOCASE ASC`,
    )
    .all() as StaffRow[];
}
