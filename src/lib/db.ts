import Database from "better-sqlite3";
import path from "path";
import { existsSync, mkdirSync } from "fs";
import { runMigrations } from "./migrate";
import {
  seedIfEmpty,
  seedRolePermissions,
  seedDemoUsers,
  syncInventoryUsers,
} from "./seed";
import { ensureFrontdeskWhatsAppSettings } from "./whatsapp-notify";
import {
  ensureConferenceChecklistSessions,
  repairPrematureInProgressSessions,
} from "./checklists";
import { repairBrokenSessions, repairChecklistSlugAliases, patchLaundryShiftLeader, repairNullChecklistIds } from "./sessions-db";
import { createUsersView, ensureSharedUserColumns } from "./users-db";
import { migrateChecklistDataFromInventory } from "./inventory-migrate";
import { seedStaffDirectory } from "./staff";

let _db: Database.Database | null = null;

/** This app's OWN database — holds all checklist data (not user accounts). */
export function resolveDbPath(): string {
  if (process.env.MV_DB_PATH) return process.env.MV_DB_PATH;
  return path.join(process.cwd(), "data", "mv-checklist.db");
}

/**
 * The shared inventory database, used ONLY for user accounts. Returns null when
 * not found (standalone mode → users live in this app's own DB).
 */
export function resolveInventoryDbPath(): string | null {
  if (process.env.MV_INVENTORY_DB_PATH) {
    return existsSync(process.env.MV_INVENTORY_DB_PATH)
      ? process.env.MV_INVENTORY_DB_PATH
      : null;
  }
  const candidates = [
    path.join(
      process.cwd(),
      "..",
      "MV Operating System",
      "mv-inventory",
      "data",
      "mv-inventory.db",
    ),
    path.join(process.cwd(), "..", "mv-inventory", "data", "mv-inventory.db"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = resolveDbPath();
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const isFreshDb = !existsSync(dbPath);

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  // Disable FK enforcement during one-time setup (copy from inventory + schema
  // repairs that temporarily reshape parent keys). Re-enabled for runtime below.
  db.pragma("foreign_keys = OFF");

  const invPath = resolveInventoryDbPath();
  const shared = Boolean(invPath);

  if (invPath) {
    const escaped = invPath.replace(/\\/g, "/").replace(/'/g, "''");
    db.exec(`ATTACH DATABASE '${escaped}' AS inv`);

    // First run: copy existing checklist data out of the inventory DB into this
    // app's own database (non-destructive — inventory is only read).
    if (isFreshDb) {
      migrateChecklistDataFromInventory(db);
    }
  }

  runMigrations(db, { skipUsers: shared });

  if (shared) {
    ensureSharedUserColumns(db);
    createUsersView(db);
  }

  repairBrokenSessions(db);
  repairChecklistSlugAliases(db);
  repairNullChecklistIds(db);
  patchLaundryShiftLeader(db);
  if (!shared) syncInventoryUsers(db);
  seedRolePermissions(db);
  if (!shared) seedDemoUsers(db);
  seedIfEmpty(db);
  seedStaffDirectory(db);
  ensureFrontdeskWhatsAppSettings(db);

  db.pragma("foreign_keys = ON");

  _db = db;
  // After _db is set so getOrCreateSession / sessionProgress can resolve the singleton.
  ensureConferenceChecklistSessions(db);
  repairPrematureInProgressSessions(db);
  return _db;
}

export function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}
