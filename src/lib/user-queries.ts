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
};

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
  };
}

export function selectUserById(
  db: Database.Database,
  id: string,
): RawUser | undefined {
  if (usesInventoryUserSchema(db)) {
    const cols = usersTableColumns(db);
    const phoneSelect = cols.has("phone") ? "phone" : "NULL as phone";
    return db
      .prepare(
        `SELECT id, username, role, full_name as display_name, ${phoneSelect},
                is_active as active
         FROM users WHERE id = ?`,
      )
      .get(id) as RawUser | undefined;
  }
  return db
    .prepare(
      `SELECT id, username, role, display_name, phone, active FROM users WHERE id = ?`,
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
    return db
      .prepare(
        `SELECT id, username, password_hash, role, full_name as display_name,
                ${phoneSelect}, is_active as active
         FROM users WHERE username = ? COLLATE NOCASE`,
      )
      .get(username.trim()) as RawUser | undefined;
  }
  return db
    .prepare(
      `SELECT id, username, password as password_hash, role, display_name, phone, active
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
    return db
      .prepare(
        `SELECT id, username, role, full_name as display_name, ${phoneSelect},
                is_active as active, checklist_only
         FROM users ORDER BY username`,
      )
      .all();
  }
  return db
    .prepare(
      `SELECT id, username, role, display_name, phone, active, checklist_only FROM users ORDER BY username`,
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
  if (usesInventoryUserSchema(db)) {
    const cols = usersTableColumns(db);
    if (cols.has("phone")) {
      db.prepare(
        `INSERT INTO ${table} (id, username, password_hash, full_name, role, is_active, checklist_only, phone, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, datetime('now'))`,
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
        `INSERT INTO ${table} (id, username, password_hash, full_name, role, is_active, checklist_only, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, datetime('now'))`,
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
    `INSERT INTO ${table} (id, username, password, role, display_name, phone, active, checklist_only)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
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
  },
) {
  const table = usersWriteTable(db);
  if (usesInventoryUserSchema(db)) {
    const cols = usersTableColumns(db);
    const hasPhone = cols.has("phone");
    if (data.password) {
      if (hasPhone) {
        db.prepare(
          `UPDATE ${table} SET username=?, password_hash=?, role=?, full_name=?, is_active=?, checklist_only=?, phone=? WHERE id=?`,
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
          `UPDATE ${table} SET username=?, password_hash=?, role=?, full_name=?, is_active=?, checklist_only=? WHERE id=?`,
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
        `UPDATE ${table} SET username=?, role=?, full_name=?, is_active=?, checklist_only=?, phone=? WHERE id=?`,
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
        `UPDATE ${table} SET username=?, role=?, full_name=?, is_active=?, checklist_only=? WHERE id=?`,
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
      `UPDATE ${table} SET username=?, password=?, role=?, display_name=?, phone=?, active=?, checklist_only=? WHERE id=?`,
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
      `UPDATE ${table} SET username=?, role=?, display_name=?, phone=?, active=?, checklist_only=? WHERE id=?`,
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
