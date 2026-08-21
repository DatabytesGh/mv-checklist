import type Database from "better-sqlite3";
import { normalizeChecklistSlug, slugVariants } from "./checklist-slugs";
import { getDb, todayDate } from "./db";
import type { ChecklistSession, SessionStatus } from "./types";
import {
  newResponseId,
  newSessionId,
  sessionsUseTextId,
  tableIdIsText,
} from "./sessions-db";

export function resolveChecklistType(
  db: Database.Database,
  slug: string,
): { slug: string; label: string; completer_role?: string } | undefined {
  for (const variant of slugVariants(slug)) {
    const row = db
      .prepare(
        "SELECT slug, label, completer_role FROM checklist_types WHERE slug = ? AND is_active = 1",
      )
      .get(variant) as { slug: string; label: string; completer_role: string } | undefined;
    if (row) return row;
  }
  return undefined;
}

/** Preferred order for checklists spawned under every conference. */
export const CONFERENCE_CHECKLIST_SLUGS = [
  "operational",
  "facility",
  "kitchen",
  "cyberbar",
  "frontdesk",
  "pre-conference",
  "conference-it",
] as const;

/** Active checklist type slugs to attach to a conference (preferred order). */
export function conferenceChecklistSlugs(
  db: Database.Database = getDb(),
): string[] {
  const active = new Set(
    (
      db
        .prepare(`SELECT slug FROM checklist_types WHERE is_active = 1`)
        .all() as Array<{ slug: string }>
    ).map((r) => r.slug),
  );
  const ordered = CONFERENCE_CHECKLIST_SLUGS.filter((s) => active.has(s));
  const orderedSet = new Set<string>(ordered);
  const extras = (
    db
      .prepare(
        `SELECT slug FROM checklist_types
         WHERE is_active = 1 AND frequency = 'event'
         ORDER BY display_order`,
      )
      .all() as Array<{ slug: string }>
  )
    .map((r) => r.slug)
    .filter((s) => !orderedSet.has(s));
  return [...ordered, ...extras];
}

/**
 * Ensure every Planning/Active conference has a session for each conference
 * checklist slug (idempotent via getOrCreateSession).
 */
export function ensureConferenceChecklistSessions(
  db: Database.Database = getDb(),
): void {
  const slugs = conferenceChecklistSlugs(db);
  if (slugs.length === 0) return;

  const conferences = db
    .prepare(
      `SELECT id, start_date, created_by_user_id
         FROM conferences
         WHERE status IN ('Planning', 'Active')
           AND end_date >= date('now', 'localtime')`,
    )
    .all() as Array<{
    id: number;
    start_date: string;
    created_by_user_id: string | null;
  }>;

  for (const c of conferences) {
    if (!c.created_by_user_id) continue;
    for (const slug of slugs) {
      getOrCreateSession(slug, c.created_by_user_id, c.start_date, c.id, db);
    }
  }
}

export function getOrCreateSession(
  slug: string,
  userId: string,
  date = todayDate(),
  conferenceId: number | null = null,
  db: Database.Database = getDb(),
): ChecklistSession {
  const textId = sessionsUseTextId(db);
  const type = resolveChecklistType(db, slug);
  const canonicalSlug = type?.slug ?? normalizeChecklistSlug(slug);
  const variants = slugVariants(canonicalSlug);
  const inList = variants.map(() => "?").join(", ");

  let session = db
    .prepare(
      `SELECT * FROM checklist_sessions
       WHERE checklist_type_slug IN (${inList}) AND date = ?
       AND COALESCE(conference_id, -1) = COALESCE(?, -1)
       AND id IS NOT NULL
       ORDER BY id DESC LIMIT 1`,
    )
    .get(...variants, date, conferenceId) as ChecklistSession | undefined;

  if (!session) {
    if (textId) {
      const id = newSessionId();
      db.prepare(
        `INSERT INTO checklist_sessions (id, checklist_type_slug, date, conference_id, status, started_by_user_id)
         VALUES (?, ?, ?, ?, 'not_started', ?)`,
      ).run(id, canonicalSlug, date, conferenceId, userId);
      session = db
        .prepare("SELECT * FROM checklist_sessions WHERE id = ?")
        .get(id) as ChecklistSession;
    } else {
      const result = db
        .prepare(
          `INSERT INTO checklist_sessions (checklist_type_slug, date, conference_id, status, started_by_user_id)
           VALUES (?, ?, ?, 'not_started', ?)`,
        )
        .run(canonicalSlug, date, conferenceId, userId);
      session = db
        .prepare("SELECT * FROM checklist_sessions WHERE id = ?")
        .get(result.lastInsertRowid) as ChecklistSession;
    }

    const templates = db
      .prepare(
        `SELECT id FROM checklist_templates WHERE checklist_type_slug = ? AND is_active = 1 ORDER BY item_order`,
      )
      .all(canonicalSlug) as { id: number }[];

    const textResponseId = tableIdIsText(db, "checklist_item_responses");
    for (const t of templates) {
      if (textResponseId) {
        db.prepare(
          `INSERT OR IGNORE INTO checklist_item_responses (id, session_id, template_item_id, status)
           VALUES (?, ?, ?, 'pending')`,
        ).run(newResponseId(), session!.id, String(t.id));
      } else {
        db.prepare(
          `INSERT OR IGNORE INTO checklist_item_responses (session_id, template_item_id, status)
           VALUES (?, ?, 'pending')`,
        ).run(session!.id, t.id);
      }
    }
  }
  // Opening a checklist must NOT flip not_started → in_progress.
  // That happens only when the first item is checked (see markSessionInProgress).

  return session;
}

/** Promote a session to in_progress when real work begins (first item addressed). */
export function markSessionInProgress(
  sessionId: number | string,
  userId: string,
  db: Database.Database = getDb(),
): boolean {
  const row = db
    .prepare(`SELECT status FROM checklist_sessions WHERE id = ?`)
    .get(sessionId) as { status: string } | undefined;
  if (!row) return false;
  if (row.status !== "not_started" && row.status !== "in_progress") return false;

  // Only promote from not_started; leave submitted/approved/rejected alone.
  if (row.status !== "not_started") return false;

  db.prepare(
    `UPDATE checklist_sessions
     SET status = 'in_progress', started_by_user_id = ?
     WHERE id = ? AND status = 'not_started'`,
  ).run(userId, sessionId);
  return true;
}

/**
 * If a submitted checklist is edited again, pull it out of "awaiting approval"
 * so the staff must re-submit after their changes.
 */
export function reopenSubmittedSession(
  sessionId: number | string,
  db: Database.Database = getDb(),
): boolean {
  const row = db
    .prepare(`SELECT status FROM checklist_sessions WHERE id = ?`)
    .get(sessionId) as { status: string } | undefined;
  if (!row || row.status !== "submitted") return false;

  db.prepare(
    `UPDATE checklist_sessions
     SET status = 'in_progress', submitted_at = NULL
     WHERE id = ? AND status = 'submitted'`,
  ).run(sessionId);
  return true;
}

/**
 * Repair sessions that were marked in_progress just by opening (0 items addressed).
 * Safe to run on boot / list — does not touch submitted/approved/rejected.
 */
export function repairPrematureInProgressSessions(
  db: Database.Database = getDb(),
): number {
  const rows = db
    .prepare(
      `SELECT id FROM checklist_sessions WHERE status = 'in_progress'`,
    )
    .all() as Array<{ id: string | number }>;

  let fixed = 0;
  for (const row of rows) {
    const progress = sessionProgress(row.id);
    if (progress.addressed === 0) {
      db.prepare(
        `UPDATE checklist_sessions SET status = 'not_started' WHERE id = ? AND status = 'in_progress'`,
      ).run(row.id);
      fixed += 1;
    }
  }
  return fixed;
}

export function updateSessionStatus(
  sessionId: number | string,
  status: SessionStatus,
  extra: {
    approved_by?: string;
    rejection_reason?: string;
    notes?: string;
  } = {},
) {
  const db = getDb();
  if (status === "submitted") {
    db.prepare(
      `UPDATE checklist_sessions SET status = ?, submitted_at = datetime('now') WHERE id = ?`,
    ).run(status, sessionId);
  } else if (status === "approved") {
    db.prepare(
      `UPDATE checklist_sessions SET status = ?, approved_by_user_id = ?, approved_at = datetime('now') WHERE id = ?`,
    ).run(status, extra.approved_by ?? null, sessionId);
  } else if (status === "rejected") {
    db.prepare(
      `UPDATE checklist_sessions SET status = ?, rejection_reason = ? WHERE id = ?`,
    ).run(status, extra.rejection_reason ?? null, sessionId);
  } else {
    db.prepare(`UPDATE checklist_sessions SET status = ? WHERE id = ?`).run(
      status,
      sessionId,
    );
  }
}

export function sessionProgress(sessionId: number | string) {
  const db = getDb();

  // Progress must match the checklist UI: only ACTIVE template items for this
  // session's type. Responses left behind on deactivated/renamed items must not
  // inflate totals or show phantom "not done" counts.
  const templateTotal = db
    .prepare(
      `SELECT COUNT(*) AS c FROM checklist_templates t
         JOIN checklist_sessions s ON s.checklist_type_slug = t.checklist_type_slug
         WHERE s.id = ? AND t.is_active = 1`,
    )
    .get(sessionId) as { c: number } | undefined;

  const rows = db
    .prepare(
      `SELECT COALESCE(NULLIF(r.status, ''), 'pending') AS status, COUNT(*) AS c
       FROM checklist_templates t
       JOIN checklist_sessions s ON s.checklist_type_slug = t.checklist_type_slug
       LEFT JOIN checklist_item_responses r
         ON r.session_id = s.id
        AND CAST(r.template_item_id AS TEXT) = CAST(t.id AS TEXT)
       WHERE s.id = ? AND t.is_active = 1
       GROUP BY COALESCE(NULLIF(r.status, ''), 'pending')`,
    )
    .all(sessionId) as { status: string; c: number }[];

  const total = templateTotal?.c ?? 0;
  const checked = rows.find((r) => r.status === "checked")?.c ?? 0;
  const faulty = rows.find((r) => r.status === "faulty")?.c ?? 0;
  const na = rows.find((r) => r.status === "na")?.c ?? 0;
  const notDone = rows.find((r) => r.status === "not_done")?.c ?? 0;
  /** Counts toward submit (no pending left). */
  const addressed = checked + faulty + na + notDone;
  /** Active items with no response (or still pending) still need input. */
  const pending = Math.max(0, total - addressed);
  /** Counts toward completion % — omitted / N/A lower the bar, not raise it. */
  const completed = checked + faulty;

  return {
    total,
    checked,
    faulty,
    na,
    not_done: notDone,
    pending,
    addressed,
    completed,
  };
}

/**
 * Mark unfinished (pending / missing) items as not_done so a checklist can be
 * submitted with omissions. Shift-leader fields are left alone — still required.
 */
export function markPendingItemsNotDone(
  sessionId: number | string,
  userId: string,
): number {
  const db = getDb();
  const textResponseId = tableIdIsText(db, "checklist_item_responses");

  // Ensure every active template item has a response row.
  const missing = db
    .prepare(
      `SELECT t.id AS template_id
       FROM checklist_templates t
       JOIN checklist_sessions s ON s.checklist_type_slug = t.checklist_type_slug
       WHERE s.id = ?
         AND t.is_active = 1
         AND t.is_shift_leader_selector = 0
         AND NOT EXISTS (
           SELECT 1 FROM checklist_item_responses r
           WHERE r.session_id = s.id AND r.template_item_id = t.id
         )`,
    )
    .all(sessionId) as Array<{ template_id: string | number }>;

  for (const row of missing) {
    if (textResponseId) {
      db.prepare(
        `INSERT INTO checklist_item_responses
           (id, session_id, template_item_id, status, checked_by_user_id, checked_at)
         VALUES (?, ?, ?, 'not_done', ?, datetime('now'))`,
      ).run(newResponseId(), sessionId, String(row.template_id), userId);
    } else {
      db.prepare(
        `INSERT INTO checklist_item_responses
           (session_id, template_item_id, status, checked_by_user_id, checked_at)
         VALUES (?, ?, 'not_done', ?, datetime('now'))`,
      ).run(sessionId, row.template_id, userId);
    }
  }

  const updated = db
    .prepare(
      `UPDATE checklist_item_responses
       SET status = 'not_done',
           checked_by_user_id = COALESCE(checked_by_user_id, ?),
           checked_at = COALESCE(checked_at, datetime('now'))
       WHERE session_id = ?
         AND status IN ('pending', '')
         AND template_item_id IN (
           SELECT id FROM checklist_templates
           WHERE is_active = 1 AND is_shift_leader_selector = 0
         )`,
    )
    .run(userId, sessionId).changes;

  return missing.length + updated;
}

export function validateSessionForSubmit(
  sessionId: number | string,
): { ok: true } | { ok: false; error: string } {
  const db = getDb();
  const progress = sessionProgress(sessionId);
  if (progress.pending > 0) {
    return {
      ok: false,
      error: `${progress.pending} items still need a response (or mark Not done)`,
    };
  }

  const items = db
    .prepare(
      `SELECT t.item_text, t.requires_time_entry, t.requires_text_entry, t.is_shift_leader_selector,
              r.status, r.text_value, r.time_value
       FROM checklist_templates t
       INNER JOIN checklist_item_responses r ON r.template_item_id = t.id AND r.session_id = ?
       WHERE t.is_active = 1`,
    )
    .all(sessionId) as Array<{
    item_text: string;
    requires_time_entry: number;
    requires_text_entry: number;
    is_shift_leader_selector: number;
    status: string;
    text_value: string | null;
    time_value: string | null;
  }>;

  for (const item of items) {
    if (item.is_shift_leader_selector && !item.text_value?.trim()) {
      return {
        ok: false,
        error: "Select shift leader for tomorrow before submitting",
      };
    }
    if (item.status === "checked" || item.status === "faulty") {
      if (
        item.requires_text_entry &&
        !item.is_shift_leader_selector &&
        !item.text_value?.trim()
      ) {
        return {
          ok: false,
          error: `"${item.item_text}" needs notes before submit`,
        };
      }
      if (item.requires_time_entry && !item.time_value?.trim()) {
        return {
          ok: false,
          error: `"${item.item_text}" needs a time before submit`,
        };
      }
    }
  }

  return { ok: true };
}
