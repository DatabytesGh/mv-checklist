import type Database from "better-sqlite3";

/**
 * Checklist-domain tables that should live in the checklist app's own DB.
 * `users` is intentionally excluded — accounts stay shared with the inventory
 * system. Order matters: parents before children (FKs are off, but keep it
 * tidy and predictable).
 */
const COPY_TABLES = [
  "role_permissions",
  "vendors",
  "conferences",
  "checklist_types",
  "checklist_templates",
  "checklist_sessions",
  "checklist_item_responses",
  "fault_reports",
  "fault_photos",
  "settings",
  "audit_logs",
];

/**
 * Foreign keys that point at the `users` table. After the split, accounts live
 * only in the inventory DB, so these cross-database references can't be
 * enforced (and SQLite has foreign-key checks ON by default). Strip just those
 * clauses; all other referential integrity (types, sessions, vendors…) is kept.
 */
const USER_FK_RE =
  /,\s*FOREIGN KEY\s*\([^)]*\)\s*REFERENCES\s*users\s*\([^)]*\)(\s+ON\s+\w+\s+\w+)*/gi;

function stripUserForeignKeys(ddl: string): string {
  return ddl.replace(USER_FK_RE, "");
}

/**
 * One-time, non-destructive copy of existing checklist data from the shared
 * inventory DB (attached as `inv`) into this app's own database (`main`).
 *
 * Each table is recreated in `main` using the inventory DDL (minus the
 * now-invalid foreign keys to `users`), so the schema — including the TEXT
 * primary keys the inventory app uses — matches and rows copy cleanly. Parents
 * are copied before children so the remaining foreign keys validate. The
 * inventory DB is only read from — never modified.
 */
export function migrateChecklistDataFromInventory(db: Database.Database): void {
  const copy = db.transaction(() => {
    for (const table of COPY_TABLES) {
      const def = db
        .prepare(
          "SELECT sql FROM inv.sqlite_master WHERE type='table' AND name = ?",
        )
        .get(table) as { sql: string } | undefined;
      if (!def?.sql) continue;

      const alreadyInMain = db
        .prepare(
          "SELECT name FROM main.sqlite_master WHERE type='table' AND name = ?",
        )
        .get(table);
      if (alreadyInMain) continue;

      db.exec(stripUserForeignKeys(def.sql));
      db.exec(`INSERT INTO main."${table}" SELECT * FROM inv."${table}"`);
    }
  });

  copy();
}
