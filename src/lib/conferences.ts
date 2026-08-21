import type Database from "better-sqlite3";

/** Local calendar date as YYYY-MM-DD (Ghana is UTC, but stay consistent with the UI). */
export function localCalendarDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Mark Planning/Active conferences whose end date has passed as Completed so
 * they drop off the dashboard and live checklist list. Idempotent.
 */
export function archivePastConferences(db: Database.Database): number {
  const result = db
    .prepare(
      `UPDATE conferences
          SET status = 'Completed'
        WHERE end_date < date('now', 'localtime')
          AND status IN ('Planning', 'Active')`,
    )
    .run();
  return Number(result.changes);
}
