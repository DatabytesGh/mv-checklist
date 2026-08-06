import type Database from "better-sqlite3";

/** Map shared inventory `users` row to checklist app shape. */
export type DbUserRow = {
  id: string;
  username: string;
  password_hash: string;
  full_name: string;
  role: string;
  is_active: number;
  checklist_only?: number;
  phone?: string | null;
};

export function usersTableColumns(db: Database.Database): Set<string> {
  const cols = db.prepare("PRAGMA table_info(users)").all() as Array<{
    name: string;
  }>;
  return new Set(cols.map((c) => c.name));
}

export function usesInventoryUserSchema(db: Database.Database): boolean {
  const cols = usersTableColumns(db);
  return cols.has("password_hash") && cols.has("full_name");
}

/** True when the shared inventory DB is attached (users are shared). */
export function isUsersShared(db: Database.Database): boolean {
  const dbs = db.prepare("PRAGMA database_list").all() as Array<{
    name: string;
  }>;
  return dbs.some((d) => d.name === "inv");
}

/** Qualified table name for user WRITES (the view isn't writable). */
export function usersWriteTable(db: Database.Database): string {
  return isUsersShared(db) ? "inv.users" : "users";
}

/**
 * Expose the shared inventory `users` table under the bare name `users` so all
 * existing reads/joins (`FROM users`, `JOIN users`) work unchanged. The view is
 * read-only; writes go through usersWriteTable().
 */
export function createUsersView(db: Database.Database): void {
  // Scope the drop to the temp schema — an unqualified `users` would resolve to
  // the attached inventory table and DROP VIEW would refuse it.
  db.exec("DROP VIEW IF EXISTS temp.users");
  db.exec("CREATE TEMP VIEW users AS SELECT * FROM inv.users");
}

/** Ensure the shared accounts table has checklist-only + phone columns. */
export function ensureSharedUserColumns(db: Database.Database): void {
  // Schema-qualified PRAGMAs aren't valid as `PRAGMA table_info(inv.users)`;
  // use the table-valued pragma function with the schema as the 2nd argument.
  const cols = db
    .prepare("SELECT name FROM pragma_table_info('users', 'inv')")
    .all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("checklist_only")) {
    db.exec(
      "ALTER TABLE inv.users ADD COLUMN checklist_only INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!names.has("phone")) {
    db.exec("ALTER TABLE inv.users ADD COLUMN phone TEXT");
  }
  if (!names.has("must_change_password")) {
    db.exec(
      "ALTER TABLE inv.users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0",
    );
  }
}
