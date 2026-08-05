import type Database from "better-sqlite3";
import { randomUUID } from "crypto";

export function sessionsUseTextId(db: Database.Database): boolean {
  const cols = db.prepare("PRAGMA table_info(checklist_sessions)").all() as Array<{
    name: string;
    type: string;
  }>;
  const idCol = cols.find((c) => c.name === "id");
  return idCol?.type?.toUpperCase() === "TEXT";
}

export function newSessionId(): string {
  return `sess-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export function newResponseId(): string {
  return `resp-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export function newFaultId(): string {
  return `fault-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export function newPhotoId(): string {
  return `photo-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export function tableIdIsText(
  db: Database.Database,
  table: string,
): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
    type: string;
  }>;
  const idCol = cols.find((c) => c.name === "id");
  return idCol?.type?.toUpperCase() === "TEXT";
}

/** Remove broken rows from failed INTEGER-style inserts into TEXT-id schema. */
export function repairBrokenSessions(db: Database.Database): void {
  if (!sessionsUseTextId(db)) return;

  const broken = db
    .prepare("SELECT COUNT(*) as c FROM checklist_sessions WHERE id IS NULL")
    .get() as { c: number };
  if (broken.c === 0) return;

  db.exec(`
    DELETE FROM checklist_item_responses WHERE session_id IS NULL;
    DELETE FROM checklist_sessions WHERE id IS NULL;
  `);
}

/** Add laundry shift-leader item if missing (existing DBs seeded before fix). */
export function patchLaundryShiftLeader(db: Database.Database): void {
  const slug = "laundry";
  const exists = db
    .prepare(
      `SELECT 1 FROM checklist_templates WHERE checklist_type_slug = ? AND is_shift_leader_selector = 1`,
    )
    .get(slug);
  if (exists) return;
  const maxOrder = (
    db
      .prepare(
        `SELECT COALESCE(MAX(item_order), 0) as m FROM checklist_templates WHERE checklist_type_slug = ?`,
      )
      .get(slug) as { m: number }
  ).m;
  db.prepare(
    `INSERT INTO checklist_templates (checklist_type_slug, section, item_order, item_text, requires_time_entry, requires_text_entry, is_shift_leader_selector)
     VALUES (?, 'Handover', ?, 'Shift leader for tomorrow', 0, 0, 1)`,
  ).run(slug, maxOrder + 1);
}

/** Align legacy underscore slugs with hyphenated checklist_types rows. */
export function repairChecklistSlugAliases(db: Database.Database): void {
  const pairs: Array<[string, string]> = [["conference_it", "conference-it"]];
  const moveChildren = (legacy: string, canonical: string) => {
    db.prepare(
      "UPDATE checklist_sessions SET checklist_type_slug = ? WHERE checklist_type_slug = ?",
    ).run(canonical, legacy);
    db.prepare(
      "UPDATE checklist_templates SET checklist_type_slug = ? WHERE checklist_type_slug = ?",
    ).run(canonical, legacy);
  };

  for (const [legacy, canonical] of pairs) {
    const hasLegacy = db
      .prepare("SELECT 1 FROM checklist_types WHERE slug = ?")
      .get(legacy);
    if (!hasLegacy) continue;

    const hasCanonical = db
      .prepare("SELECT 1 FROM checklist_types WHERE slug = ?")
      .get(canonical);

    if (hasCanonical) {
      // Canonical type already exists — repoint children and drop the legacy.
      moveChildren(legacy, canonical);
      db.prepare("DELETE FROM checklist_types WHERE slug = ?").run(legacy);
    } else {
      // Rename the legacy type, then move its children across (single pass, no
      // orphans). Runs with FK enforcement off during init.
      db.prepare("UPDATE checklist_types SET slug = ? WHERE slug = ?").run(
        canonical,
        legacy,
      );
      moveChildren(legacy, canonical);
    }
  }
}

/**
 * The shared inventory DB uses non-auto TEXT primary keys for checklist_types
 * and checklist_templates. Rows inserted without an id end up with id = NULL,
 * which breaks updates/deletes that match on id. Backfill any NULL ids.
 */
export function repairNullChecklistIds(db: Database.Database): void {
  const genId = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  for (const table of ["checklist_templates", "checklist_types"]) {
    let rows: Array<{ rid: number }>;
    try {
      rows = db
        .prepare(`SELECT rowid AS rid FROM ${table} WHERE id IS NULL`)
        .all() as Array<{ rid: number }>;
    } catch {
      continue;
    }
    for (const r of rows) {
      db.prepare(`UPDATE ${table} SET id = ? WHERE rowid = ?`).run(
        genId(),
        r.rid,
      );
    }
  }
}
