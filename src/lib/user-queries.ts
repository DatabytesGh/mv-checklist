import type Database from "better-sqlite3";
import { hashPassword, verifyPassword } from "./password";
import {
  usesInventoryUserSchema,
  usersTableColumns,
  usersWriteTable,
} from "./users-db";
import type { ChecklistRole, SessionUser } from "./types";
import { getRolePermissions } from "./seed";
import type { ChecklistPermissions } from "./types";

type RawUser = {
  id: string;
  username: string;
  role: ChecklistRole;
  display_name: string;
  phone: string | null;
  active: number;
  password?: string;
  password_hash?: string;
  must_change_password?: number;
};

function mustChangeSelect(cols: Set<string>): string {
  return cols.has("must_change_password")
    ? "must_change_password"
    : "0 as must_change_password";
}

function mapToSessionUser(
  db: Database.Database,
  row: RawUser,
): SessionUser {
  const permissions = getRolePermissions(db, row.role) as ChecklistPermissions;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    display_name: row.display_name,
    phone: row.phone ?? undefined,
    permissions,
    must_change_password: !!row.must_change_password,
  };
}

export function selectUserById(
  db: Database.Database,
  id: string,
): RawUser | undefined {
  if (usesInventoryUserSchema(db)) {
    const cols = usersTableColumns(db);
    const phoneSelect = cols.has("phone") ? "phone" : "NULL as phone";
    const forceSelect = mustChangeSelect(cols);
    return db
      .prepare(
        `SELECT id, username, role, full_name as display_name, ${phoneSelect},
                is_active as active, ${forceSelect}
         FROM users WHERE id = ?`,
      )
      .get(id) as RawUser | undefined;
  }
  const cols = usersTableColumns(db);
  const forceSelect = mustChangeSelect(cols);
  return db
    .prepare(
      `SELECT id, username, role, display_name, phone, active, ${forceSelect}
       FROM users WHERE id = ?`,
    )
    .get(id) as RawUser | undefined;
}

export function selectUserByUsername(
  db: Database.Database,
  username: string,
): RawUser | undefined {
  if (usesInventoryUserSchema(db)) {
    const cols = usersTableColumns(db);
    const phoneSelect = cols.has("phone") ? "phone" : "NULL as phone";
    const forceSelect = mustChangeSelect(cols);
    return db
      .prepare(
        `SELECT id, username, password_hash, role, full_name as display_name,
                ${phoneSelect}, is_active as active, ${forceSelect}
         FROM users WHERE username = ? COLLATE NOCASE`,
      )
      .get(username.trim()) as RawUser | undefined;
  }
  const cols = usersTableColumns(db);
  const forceSelect = mustChangeSelect(cols);
  return db
    .prepare(
      `SELECT id, username, password as password_hash, role, display_name, phone, active,
              ${forceSelect}
       FROM users WHERE username = ? COLLATE NOCASE`,
    )
    .get(username.trim()) as RawUser | undefined;
}

export function checkPassword(row: RawUser, password: string): boolean {
  const hash = row.password_hash ?? row.password;
  if (!hash) return false;
  if (hash.length === 64 && /^[a-f0-9]+$/.test(hash)) {
    return verifyPassword(password, hash);
  }
  return hash === password.trim();
}

export function userToSession(
  db: Database.Database,
  row: RawUser,
): SessionUser {
  return mapToSessionUser(db, row);
}

export function listActiveUsersByRole(db: Database.Database, role: string) {
  if (usesInventoryUserSchema(db)) {
    return db
      .prepare(
        `SELECT id, username, full_name as display_name, role FROM users
         WHERE is_active = 1 AND role = ? ORDER BY full_name`,
      )
      .all(role);
  }
  return db
    .prepare(
      `SELECT id, username, display_name, role FROM users WHERE active = 1 AND role = ? ORDER BY display_name`,
    )
    .all(role);
}

export function listActiveUsers(db: Database.Database) {
  if (usesInventoryUserSchema(db)) {
    return db
      .prepare(
        `SELECT id, username, full_name as display_name, role FROM users
         WHERE is_active = 1 ORDER BY full_name`,
      )
      .all();
  }
  return db
    .prepare(
      `SELECT id, username, display_name, role FROM users WHERE active = 1 ORDER BY display_name`,
    )
    .all();
}

export function listAllUsers(db: Database.Database) {
  if (usesInventoryUserSchema(db)) {
    const cols = usersTableColumns(db);
    const phoneSelect = cols.has("phone") ? "phone" : "NULL as phone";
    const forceSelect = mustChangeSelect(cols);
    return db
      .prepare(
        `SELECT id, username, role, full_name as display_name, ${phoneSelect},
                is_active as active, checklist_only, ${forceSelect}
         FROM users ORDER BY username`,
      )
      .all();
  }
  const cols = usersTableColumns(db);
  const forceSelect = mustChangeSelect(cols);
  return db
    .prepare(
      `SELECT id, username, role, display_name, phone, active, checklist_only, ${forceSelect}
       FROM users ORDER BY username`,
    )
    .all();
}

export function insertUser(
  db: Database.Database,
  data: {
    id: string;
    username: string;
    password: string;
    role: string;
    display_name: string;
    checklist_only: boolean;
    phone?: string;
  },
) {
  const table = usersWriteTable(db);
  // New accounts always require a password change on first login.
  if (usesInventoryUserSchema(db)) {
    const cols = usersTableColumns(db);
    if (cols.has("phone")) {
      db.prepare(
        `INSERT INTO ${table} (id, username, password_hash, full_name, role, is_active, checklist_only, phone, must_change_password, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, 1, datetime('now'))`,
      ).run(
        data.id,
        data.username,
        hashPassword(data.password),
        data.display_name,
        data.role,
        data.checklist_only ? 1 : 0,
        data.phone ?? null,
      );
    } else {
      db.prepare(
        `INSERT INTO ${table} (id, username, password_hash, full_name, role, is_active, checklist_only, must_change_password, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, 1, datetime('now'))`,
      ).run(
        data.id,
        data.username,
        hashPassword(data.password),
        data.display_name,
        data.role,
        data.checklist_only ? 1 : 0,
      );
    }
    return;
  }
  db.prepare(
    `INSERT INTO ${table} (id, username, password, role, display_name, phone, active, checklist_only, must_change_password)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, 1)`,
  ).run(
    data.id,
    data.username,
    data.password,
    data.role,
    data.display_name,
    data.phone ?? null,
    data.checklist_only ? 1 : 0,
  );
}

export function updateUser(
  db: Database.Database,
  data: {
    id: string;
    username: string;
    password?: string;
    role: string;
    display_name: string;
    active: boolean;
    checklist_only: boolean;
    phone?: string;
    /** When true (or when a new password is set), force change on next login. */
    must_change_password?: boolean;
  },
) {
  const table = usersWriteTable(db);
  const cols = usersTableColumns(db);
  const hasForce = cols.has("must_change_password");
  // Admin-set password always forces a change; explicit flag can force without
  // changing the password; otherwise leave the existing flag alone.
  const forceOnPassword = Boolean(data.password?.trim());
  const forceExplicit = data.must_change_password === true;
  const setForce = hasForce && (forceOnPassword || forceExplicit);
  const clearForce = hasForce && data.must_change_password === false && !forceOnPassword;

  if (usesInventoryUserSchema(db)) {
    const hasPhone = cols.has("phone");
    if (data.password) {
      if (hasPhone) {
        db.prepare(
          `UPDATE ${table} SET username=?, password_hash=?, role=?, full_name=?, is_active=?, checklist_only=?, phone=?${
            setForce ? ", must_change_password=1" : ""
          } WHERE id=?`,
        ).run(
          data.username,
          hashPassword(data.password),
          data.role,
          data.display_name,
          data.active ? 1 : 0,
          data.checklist_only ? 1 : 0,
          data.phone ?? null,
          data.id,
        );
      } else {
        db.prepare(
          `UPDATE ${table} SET username=?, password_hash=?, role=?, full_name=?, is_active=?, checklist_only=?${
            setForce ? ", must_change_password=1" : ""
          } WHERE id=?`,
        ).run(
          data.username,
          hashPassword(data.password),
          data.role,
          data.display_name,
          data.active ? 1 : 0,
          data.checklist_only ? 1 : 0,
          data.id,
        );
      }
    } else if (hasPhone) {
      db.prepare(
        `UPDATE ${table} SET username=?, role=?, full_name=?, is_active=?, checklist_only=?, phone=?${
          setForce
            ? ", must_change_password=1"
            : clearForce
              ? ", must_change_password=0"
              : ""
        } WHERE id=?`,
      ).run(
        data.username,
        data.role,
        data.display_name,
        data.active ? 1 : 0,
        data.checklist_only ? 1 : 0,
        data.phone ?? null,
        data.id,
      );
    } else {
      db.prepare(
        `UPDATE ${table} SET username=?, role=?, full_name=?, is_active=?, checklist_only=?${
          setForce
            ? ", must_change_password=1"
            : clearForce
              ? ", must_change_password=0"
              : ""
        } WHERE id=?`,
      ).run(
        data.username,
        data.role,
        data.display_name,
        data.active ? 1 : 0,
        data.checklist_only ? 1 : 0,
        data.id,
      );
    }
    return;
  }

  if (data.password) {
    db.prepare(
      `UPDATE ${table} SET username=?, password=?, role=?, display_name=?, phone=?, active=?, checklist_only=?${
        setForce ? ", must_change_password=1" : ""
      } WHERE id=?`,
    ).run(
      data.username,
      data.password,
      data.role,
      data.display_name,
      data.phone ?? null,
      data.active ? 1 : 0,
      data.checklist_only ? 1 : 0,
      data.id,
    );
  } else {
    db.prepare(
      `UPDATE ${table} SET username=?, role=?, display_name=?, phone=?, active=?, checklist_only=?${
        setForce
          ? ", must_change_password=1"
          : clearForce
            ? ", must_change_password=0"
            : ""
      } WHERE id=?`,
    ).run(
      data.username,
      data.role,
      data.display_name,
      data.phone ?? null,
      data.active ? 1 : 0,
      data.checklist_only ? 1 : 0,
      data.id,
    );
  }
}

/** User-initiated password change — clears the force-change flag. */
export function changeOwnPassword(
  db: Database.Database,
  userId: string,
  newPassword: string,
): void {
  const table = usersWriteTable(db);
  const cols = usersTableColumns(db);
  const hasForce = cols.has("must_change_password");
  const forceClear = hasForce ? ", must_change_password=0" : "";

  if (usesInventoryUserSchema(db)) {
    db.prepare(
      `UPDATE ${table} SET password_hash=?${forceClear} WHERE id=?`,
    ).run(hashPassword(newPassword), userId);
    return;
  }
  db.prepare(`UPDATE ${table} SET password=?${forceClear} WHERE id=?`).run(
    newPassword,
    userId,
  );
}
